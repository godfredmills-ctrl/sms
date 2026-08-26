#!/usr/bin/env node
/**
 * Would any cell in the printed register be cut off?
 *
 * `renderReportPdf` divides the page into equal columns and truncates anything
 * that will not fit, with an ellipsis. That is right for a long asset name and
 * wrong for a money column: "GHS 1,200,000.00" clipped to "GHS 1,200,00…" is a
 * figure an auditor would read, believe, and reconcile against nothing.
 *
 * The register has ten columns, which is as many as the layout can carry, so
 * this measures the widest realistic value in each one against the space it
 * actually gets — using the same font and the same arithmetic the renderer
 * uses, because eyeballing a PDF at this density does not catch four points.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";

const PAGE_W = 841.89;
const MARGIN = 44;
const COLUMNS = 10;

const usable = PAGE_W - MARGIN * 2;
const columnWidth = usable / COLUMNS;
const cellWidth = columnWidth - 8;

const pdf = await PDFDocument.create();
const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

// The widest thing each column will realistically ever hold. Money is the one
// that matters: a Ghanaian school's land and buildings run to seven figures.
const samples = [
  { column: "Tag", text: "SMIS/VEH/0001", font: regular, size: 8, critical: true },
  { column: "Asset", text: "Toyota Hiace minibus", font: regular, size: 8, critical: false },
  { column: "Category", text: "Furniture and fittings", font: regular, size: 8, critical: false },
  { column: "Where", text: "Administration block", font: regular, size: 8, critical: false },
  { column: "Held by", text: "Abena Owusu-Ansah", font: regular, size: 8, critical: false },
  { column: "State", text: "Under repair · Unserviceable", font: regular, size: 8, critical: false },
  { column: "Bought", text: "2024-09-30", font: regular, size: 8, critical: true },
  // Eight figures: a school whose land and buildings run to tens of millions
  // of cedis, which is an ordinary international school in Accra. The currency
  // is in the heading rather than the cell precisely so this fits.
  { column: "Cost", text: "12,000,000.00", font: regular, size: 8, critical: true },
  { column: "Depreciated", text: "12,000,000.00", font: regular, size: 8, critical: true },
  { column: "Written down", text: "12,000,000.00", font: regular, size: 8, critical: true },
  { column: "Depreciated (words)", text: "not depreciated", font: regular, size: 8, critical: true },
  // Headers are drawn bold at 7.5 and truncated the same way.
  { column: "header: Net book (GHS)", text: "Net book (GHS)", font: bold, size: 7.5, critical: true },
  { column: "header: Depreciated (GHS)", text: "Depreciated (GHS)", font: bold, size: 7.5, critical: true },
  { column: "header: Cost (GHS)", text: "Cost (GHS)", font: bold, size: 7.5, critical: true },
];

console.log(`\n  Page ${PAGE_W}pt, ${COLUMNS} columns of ${columnWidth.toFixed(1)}pt`);
console.log(`  Each cell may use ${cellWidth.toFixed(1)}pt\n`);

const problems = [];

for (const sample of samples) {
  const width = sample.font.widthOfTextAtSize(sample.text, sample.size);
  const fits = width <= cellWidth;
  const mark = fits ? "ok " : sample.critical ? "!! " : "-- ";

  console.log(
    `  ${mark} ${sample.column.padEnd(24)} ${width.toFixed(1).padStart(6)}pt  "${sample.text}"`,
  );

  if (!fits && sample.critical) problems.push({ ...sample, width });
}

if (problems.length) {
  console.error("\n  These would be truncated on the printed register:\n");
  for (const problem of problems) {
    console.error(
      `    ${problem.column}: needs ${problem.width.toFixed(1)}pt, has ${cellWidth.toFixed(1)}pt`,
    );
  }
  console.error(
    "\n  A clipped figure is worse than a missing one: it reads as a number.",
  );
  console.error("  Shorten the column set, or drop the currency prefix in the print.\n");
  process.exit(1);
}

console.log("\n  ok  every column of the printed register fits its widest value.\n");
