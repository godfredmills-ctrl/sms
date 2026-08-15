import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildWorkbook } from "@/lib/excel";
import { DATASETS, datasetFor, formatCell, type DatasetKey } from "@/lib/reporting";
import { loadDataset } from "@/lib/reporting-data";

/**
 * Excel export for any report dataset.
 *
 * The dataset's own permission is enforced here, not just an export
 * permission: an export is a read of the underlying data, and a download URL
 * is the easiest thing in a system to share with someone who should not have
 * it.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("dataset") as DatasetKey | null;

  const dataset = key ? datasetFor(key) : undefined;
  if (!dataset) {
    return NextResponse.json(
      {
        error: "Unknown dataset.",
        available: DATASETS.map((entry) => entry.key),
      },
      { status: 400 },
    );
  }

  let user;
  try {
    user = await authorize(dataset.permission);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const rows = await loadDataset(dataset.key);

  const workbook = await buildWorkbook({
    sheetName: dataset.label,
    title: dataset.label,
    columns: dataset.fields.map((field) => ({
      key: field.key,
      header: field.label,
    })),
    // Values are formatted for reading rather than exported raw: a bursar
    // opening this wants GH₵1,250.00, not 125000 pesewas.
    rows: rows.map((row) =>
      Object.fromEntries(
        dataset.fields.map((field) => [
          field.key,
          field.type === "number" || field.type === "date"
            ? (row[field.key] ?? null)
            : formatCell(row[field.key] ?? null, field.type),
        ]),
      ),
    ),
  });

  await db.dataJob.create({
    data: {
      direction: "EXPORT",
      entity: dataset.key,
      format: "XLSX",
      status: "COMPLETED",
      totalRows: rows.length,
      processedRows: rows.length,
      successRows: rows.length,
      completedAt: new Date(),
      createdById: user.id,
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${dataset.key}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
