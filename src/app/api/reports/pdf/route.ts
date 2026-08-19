import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadLetterhead } from "@/lib/letterhead";
import { renderReportPdf, type ReportColumn } from "@/lib/report-pdf";
import {
  datasetFor,
  formatCell,
  type ReportConfig,
} from "@/lib/reporting";
import { summariseReport } from "@/lib/report-stats";
import { seesWholeSchool } from "@/lib/scope";
import { formatDateTime } from "@/lib/utils";

/**
 * A saved report run, as a document on the school's letterhead.
 *
 * The spreadsheet export answers a bursar reconciling figures. This answers
 * the other half: the paper that goes in front of a governing board, on the
 * school's own letterhead, with the narrative underneath.
 *
 * It renders the run that was stored, not a fresh query — a report someone
 * printed on Monday should print the same on Friday, and the run already
 * holds its parameters and its rows.
 */
export const dynamic = "force-dynamic";

function message(status: number, title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#111">
<h1 style="font-size:1.1rem">${title}</h1><p style="color:#555;line-height:1.5">${body}</p>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? "";

  let user;
  try {
    user = await authorize("report.build");
  } catch (error) {
    return message(403, "Not allowed", (error as Error).message);
  }

  const run = await db.reportRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      name: true,
      parameters: true,
      result: true,
      rowCount: true,
      aiNarrative: true,
      createdAt: true,
      runById: true,
    },
  });
  if (!run) return message(404, "Report not found", "That report run no longer exists.");

  // A report run carries whatever the dataset held when it ran. Someone
  // else's run is someone else's data, so only its author and the office
  // may print it.
  if (run.runById !== user.id && !seesWholeSchool(user)) {
    return message(403, "Not your report", "You can only print reports you ran yourself.");
  }

  // Read through the type the action writes with, rather than a second
  // declaration of the same shape. The first version of this route guessed
  // filters were a list of pairs; they are a map of field key to values, and
  // calling .filter() on an object crashed every print with a filter set.
  //
  // Still parsed defensively: this is JSON off a row that may have been
  // written by an older version of the builder.
  const parameters = (run.parameters ?? {}) as Partial<ReportConfig> & {
    dataset?: string;
  };

  const dataset = datasetFor(parameters.dataset ?? "");
  if (!dataset) {
    return message(400, "Unknown dataset", "This report refers to a dataset that no longer exists.");
  }

  // The dataset's own permission, re-checked at print time: a report is a
  // read of the underlying data, and permissions change between runs.
  try {
    await authorize(dataset.permission);
  } catch {
    return message(
      403,
      "Not allowed",
      `You no longer have permission to read the ${dataset.label.toLowerCase()} dataset.`,
    );
  }

  const chosenKeys = Array.isArray(parameters.columns) ? parameters.columns : [];
  const chosen = chosenKeys.length
    ? dataset.fields.filter((field) => chosenKeys.includes(field.key))
    : dataset.fields;

  const columns: ReportColumn[] = chosen.map((field) => ({
    key: field.key,
    label: field.label,
    numeric: ["number", "money", "percent"].includes(field.type),
  }));

  // The analysis runs over the RAW values, before formatting: "GH₵1,250.00"
  // is a string and a mean of strings is nothing.
  const rawRows = (run.result as Array<Record<string, string | number | null>>) ?? [];
  const summary = summariseReport(rawRows, dataset, chosenKeys);

  const rows = rawRows.map(
    (row) =>
      Object.fromEntries(
        chosen.map((field) => [field.key, formatCell(row[field.key] ?? null, field.type)]),
      ),
  );

  // ReportRun keeps the id, not a relation — resolve the name for the byline.
  const author = run.runById
    ? await db.user.findUnique({
        where: { id: run.runById },
        select: { firstName: true, lastName: true },
      })
    : null;

  const letterhead = await loadLetterhead();
  if (!letterhead) {
    return message(400, "No school profile", "Set up the school profile under Settings first.");
  }

  const rawFilters =
    parameters.filters && typeof parameters.filters === "object"
      ? (parameters.filters as Record<string, unknown>)
      : {};

  const filters = Object.entries(rawFilters)
    .map(([key, value]) => {
      const values = (Array.isArray(value) ? value : [value])
        // Only values that are actually values. Anything else is a shape
        // this route does not understand, and a filter line reading
        // "0 = [object Object]" is worse than no filter line.
        .filter((entry) => typeof entry === "string" || typeof entry === "number")
        .map((entry) => String(entry).trim())
        .filter(Boolean);
      if (!values.length) return null;
      const field = dataset.fields.find((entry) => entry.key === key);
      return `${field?.label ?? key} = ${values.join(", ")}`;
    })
    .filter((entry): entry is string => Boolean(entry));

  const shown = rows.length;
  const total = run.rowCount;

  const pdf = await renderReportPdf({
    letterhead,
    report: {
      title: run.name,
      subtitle: [
        dataset.label,
        `${total.toLocaleString()} row${total === 1 ? "" : "s"}`,
        ...(filters.length ? [filters.join(" · ")] : []),
        // The run stores a sample rather than every row; saying so on the
        // page is better than a board reading a truncated table as complete.
        ...(shown < total ? [`showing the first ${shown.toLocaleString()}`] : []),
      ].join("  ·  "),
      meta: `Run by ${author ? `${author.firstName} ${author.lastName}` : "—"} on ${formatDateTime(run.createdAt)}`,
      columns,
      rows,
      summary,
      narrative: run.aiNarrative
        ? { heading: "Analysis", body: run.aiNarrative }
        : null,
      footerNote: `${run.name} · printed ${formatDateTime(new Date())}`,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "report.print",
      entity: "ReportRun",
      entityId: run.id,
      summary: `Printed the report "${run.name}" (${total} rows)`,
    },
  });

  const filename = run.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || "report";

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
