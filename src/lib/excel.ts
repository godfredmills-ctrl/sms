import "server-only";

import ExcelJS from "exceljs";

/**
 * Excel import and export.
 *
 * Two things this file exists to get right:
 *
 * 1. **Formula injection.** A cell beginning `=`, `+`, `-` or `@` is executed
 *    by Excel when the file is opened. A student whose "notes" field starts
 *    with `=cmd|...` turns an innocuous export into an attack on whoever opens
 *    it, so every exported string is neutralised.
 * 2. **Header matching that survives a human.** Real spreadsheets arrive with
 *    "Admission No.", "admission_no" and "ADMISSION NUMBER" in the same column
 *    across three files, so headers are matched loosely rather than exactly.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function neutralise(value: unknown): string | number | Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return value;

  const text = String(value);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

export type ExportColumn = {
  key: string;
  header: string;
  width?: number;
};

export async function buildWorkbook(input: {
  sheetName: string;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
  title?: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "School Management System";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(input.sheetName.slice(0, 31));

  sheet.columns = input.columns.map((column) => ({
    key: column.key,
    header: column.header,
    width: column.width ?? Math.max(12, column.header.length + 4),
  }));

  for (const row of input.rows) {
    sheet.addRow(
      Object.fromEntries(
        input.columns.map((column) => [column.key, neutralise(row[column.key])]),
      ),
    );
  }

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2C66CE" },
  };
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  // Frozen so a 400-row register stays readable once you scroll.
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: input.columns.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Normalises a header cell so "Admission No." and "admission_no" match. */
export function normaliseHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export type ParsedSheet = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

export async function parseWorkbook(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, index) => {
    headers[index - 1] = String(cell.value ?? "").trim();
  });

  const rows: Array<Record<string, string>> = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const entry: Record<string, string> = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const cell = row.getCell(index + 1);
      const raw = cell.value;

      let text = "";
      if (raw === null || raw === undefined) text = "";
      else if (raw instanceof Date) text = raw.toISOString().slice(0, 10);
      else if (typeof raw === "object" && "text" in raw) text = String(raw.text ?? "");
      else if (typeof raw === "object" && "result" in raw)
        text = String(raw.result ?? "");
      else text = String(raw);

      text = text.trim();
      if (text) hasValue = true;
      entry[header] = text;
    });

    // A row of empty cells is a formatting artefact, not a record. Importing
    // it creates a student with no name and a wasted admission number.
    if (hasValue) rows.push(entry);
  });

  return { headers: headers.filter(Boolean), rows };
}

/**
 * Maps loose spreadsheet headers onto known field keys.
 * Returns `{ fieldKey: sheetHeader }` for everything it could match.
 */
export function autoMap(
  headers: string[],
  fields: Array<{ key: string; label: string; aliases?: string[] }>,
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalised = headers.map((header) => ({
    header,
    key: normaliseHeader(header),
  }));

  for (const field of fields) {
    const candidates = [field.key, field.label, ...(field.aliases ?? [])].map(
      normaliseHeader,
    );
    const match = normalised.find((entry) => candidates.includes(entry.key));
    if (match) mapping[field.key] = match.header;
  }

  return mapping;
}
