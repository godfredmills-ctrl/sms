/**
 * Reads a spreadsheet the way the student importer does, and reports what it
 * saw — headers, the columns it matched, and the first few rows.
 *
 *   npm run import:check -- path/to/file.xlsx
 *
 * The importer is the one feature whose failures are invisible from the code:
 * it depends on what a school's spreadsheet actually contains, and the answer
 * is never what the sample file contains. Run this against the real file and
 * the mismatch is in front of you in a second.
 *
 * With no argument it builds a small workbook itself and reads it back, which
 * checks the parser rather than the file.
 */
import { readFile } from "node:fs/promises";

import ExcelJS from "exceljs";

import { autoMap, parseWorkbook } from "../src/lib/excel";
import { IMPORT_FIELDS } from "../src/app/(app)/students/import/fields";

async function sampleWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Students");

  sheet.addRow([
    "Admission No.",
    "First Name",
    "Surname",
    "Sex",
    "DOB",
    "Class",
    "Parent Name",
    "Contact",
  ]);
  sheet.addRow([
    "GCS/2024/0001",
    "Ama",
    "Boateng",
    "F",
    "03/04/2011",
    "JHS 3 A",
    "Kwame Boateng",
    "0244123456",
  ]);
  sheet.addRow([
    "",
    "Kofi",
    "Mensah",
    "M",
    "2011-09-15",
    "JHS 3 A",
    "Akosua Mensah",
    "0201234567",
  ]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function main() {
  const path = process.argv[2];
  const buffer = path ? await readFile(path) : await sampleWorkbook();

  console.log(path ? `Reading ${path}` : "Reading a generated sample workbook");

  const sheet = await parseWorkbook(buffer);

  console.log(`\nHeaders (${sheet.headers.length}):`);
  for (const header of sheet.headers) console.log(`  "${header}"`);

  const mapped = autoMap(sheet.headers, IMPORT_FIELDS);
  const matched = Object.entries(mapped);
  const ignored = sheet.headers.filter((header) => !Object.values(mapped).includes(header));

  console.log(`\nMatched (${matched.length}):`);
  for (const [field, header] of matched) console.log(`  ${header} -> ${field}`);

  if (ignored.length) {
    console.log(`\nIgnored (${ignored.length}):`);
    for (const header of ignored) console.log(`  "${header}"`);
  }

  console.log(`\nRows: ${sheet.rows.length}`);
  for (const [index, row] of sheet.rows.slice(0, 3).entries()) {
    console.log(`  row ${index + 2}: ${JSON.stringify(row)}`);
  }

  const missing = ["firstName", "lastName"].filter((key) => !mapped[key]);
  if (missing.length) {
    console.log(`\nFAIL: no column matched ${missing.join(" or ")}. The import would refuse this file.`);
    process.exit(1);
  }
  console.log("\nok — first and last name both matched, so the import would proceed.");
}

main().catch((error: unknown) => {
  console.error(`Could not read it: ${(error as Error).message}`);
  process.exit(1);
});
