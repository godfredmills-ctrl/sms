"use server";

import { revalidatePath } from "next/cache";

import { generateReportNarrative } from "@/lib/ai/insights";
import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  applyConfig,
  datasetFor,
  type DatasetKey,
  type ReportConfig,
  type ReportRow,
} from "@/lib/reporting";
import { loadDataset } from "@/lib/reporting-data";

export type ReportState = {
  ok?: boolean;
  error?: string;
  message?: string;
  rows?: ReportRow[];
  columns?: string[];
  dataset?: string;
  name?: string;
  rowCount?: number;
  insightId?: string;
  chartType?: string;
  /** The stored run, so the result can be printed on the letterhead. */
  runId?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function configFrom(formData: FormData): ReportConfig {
  const columns = formData.getAll("columns").map(String).filter(Boolean);

  // Filters arrive as `filter:<fieldKey>` so the builder can add a field
  // without the action needing to know its name in advance.
  const filters: Record<string, string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("filter:")) continue;
    const field = key.slice("filter:".length);
    const entry = String(value).trim();
    if (!entry) continue;
    filters[field] = [...(filters[field] ?? []), entry];
  }

  const sortKey = text(formData, "sortKey");

  return {
    columns,
    filters,
    sort: sortKey
      ? { key: sortKey, direction: text(formData, "sortDirection") === "asc" ? "asc" : "desc" }
      : undefined,
    limit: Number(text(formData, "limit")) || undefined,
  };
}

/**
 * Runs a report and returns the rows to the client.
 *
 * The dataset's own permission is checked here, not just `report.build`: a
 * report is a read of underlying data, so being allowed to build reports must
 * not become a way around the permission on the data itself.
 */
export async function runReportAction(
  _previous: ReportState,
  formData: FormData,
): Promise<ReportState> {
  let user;
  try {
    user = await authorize("report.build");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const datasetKey = text(formData, "dataset") as DatasetKey;
  const dataset = datasetFor(datasetKey);
  if (!dataset) return { error: "Choose a dataset." };

  try {
    await authorize(dataset.permission);
  } catch {
    return {
      error: `You do not have permission to read the ${dataset.label.toLowerCase()} dataset.`,
    };
  }

  const config = configFrom(formData);
  if (!config.columns.length) return { error: "Choose at least one column." };

  const name = text(formData, "name") || `${dataset.label} report`;
  const chartType = ["BAR", "LINE"].includes(text(formData, "chartType"))
    ? text(formData, "chartType")
    : "TABLE";

  const raw = await loadDataset(datasetKey);
  const rows = applyConfig(raw, dataset, config);

  const run = await db.reportRun.create({
    data: {
      name,
      parameters: { dataset: datasetKey, ...config } as never,
      status: "COMPLETED",
      rowCount: rows.length,
      // Only a sample is cached. Storing 20,000 rows as JSON on every run
      // would grow the table faster than anything else in the system.
      result: rows.slice(0, 500) as never,
      runById: user.id,
    },
  });

  let insightId: string | undefined;

  if (formData.get("includeAiInsights") === "on" && rows.length) {
    const insight = await generateReportNarrative(name, dataset.label, rows, user.id);
    if (insight) {
      const stored = await db.aiInsight.findFirst({
        where: { kind: "CUSTOM_REPORT", createdById: user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      insightId = stored?.id;
    }
  }

  if (formData.get("save") === "on") {
    await db.reportDefinition.create({
      data: {
        name,
        description: text(formData, "description") || null,
        dataset: datasetKey,
        config: config as never,
        chartType,
        includeAiInsights: formData.get("includeAiInsights") === "on",
        isShared: formData.get("isShared") === "on",
        ownerId: user.id,
        lastRunAt: new Date(),
      },
    });
    revalidatePath("/reports");
  }

  return {
    ok: true,
    rows,
    columns: config.columns,
    dataset: datasetKey,
    name,
    rowCount: rows.length,
    insightId,
    chartType,
    runId: run.id,
    message: `${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"} · run ${run.id.slice(-6)}`,
  };
}

export async function deleteReportAction(formData: FormData) {
  const user = await authorize("report.build");

  const id = text(formData, "id");
  if (!id) return;

  const definition = await db.reportDefinition.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  // Only the owner deletes a saved report. A shared report is somebody else's
  // work; removing it should not be a side effect of tidying your own list.
  if (!definition || definition.ownerId !== user.id) return;

  await db.reportDefinition.delete({ where: { id } });
  revalidatePath("/reports");
}

export async function toggleFavouriteAction(formData: FormData) {
  const user = await authorize("report.read");

  const id = text(formData, "id");
  if (!id) return;

  const definition = await db.reportDefinition.findUnique({
    where: { id },
    select: { isFavourite: true, ownerId: true },
  });
  if (!definition || definition.ownerId !== user.id) return;

  await db.reportDefinition.update({
    where: { id },
    data: { isFavourite: !definition.isFavourite },
  });
  revalidatePath("/reports");
}
