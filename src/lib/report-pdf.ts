import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import {
  drawLetterhead,
  drawLetterheadFooter,
  type Letterhead,
} from "@/lib/letterhead";
import { sanitisePdfText } from "@/lib/pdf-text";

/**
 * A report as a document.
 *
 * The report builder could already export a spreadsheet, which is the right
 * thing for a bursar reconciling figures and the wrong thing for a board
 * paper. This renders the same rows on the school's letterhead: a title, the
 * question the report was asked, the table, and the AI narrative underneath
 * when one was generated — something a head teacher can put in front of a
 * governing board without reformatting it first.
 *
 * Landscape by default because report tables are wide, and paginated with
 * the column header repeated: a second page of bare numbers is unreadable.
 */

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 44;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const RULE = rgb(0.88, 0.9, 0.93);
const ZEBRA = rgb(0.975, 0.978, 0.982);

export type ReportColumn = {
  key: string;
  label: string;
  /** Right-aligned, and never wrapped: money, counts, percentages. */
  numeric?: boolean;
};

export type ReportDocument = {
  title: string;
  /** "Students · 412 rows · filtered by Class = JHS 2 Amber" */
  subtitle?: string | null;
  /** Who ran it and when, printed small under the title. */
  meta?: string | null;
  columns: ReportColumn[];
  rows: Array<Record<string, string>>;
  /** The AI narrative, when the report was run with one. */
  narrative?: { heading: string; body: string; findings?: string[] } | null;
  /** Printed at the foot of every page. */
  footerNote?: string | null;
};

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (maxWidth <= 4) return "";
  let value = text;
  while (font.widthOfTextAtSize(value, size) > maxWidth && value.length > 1) {
    value = value.slice(0, -1);
  }
  return value === text ? value : `${value.slice(0, -1)}…`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export async function renderReportPdf(input: {
  letterhead: Letterhead;
  report: ReportDocument;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setProducer("School Management System");
  pdf.setCreationDate(new Date());

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const fonts = { regular, bold, italic };

  const clean = (value: string | null | undefined) =>
    value ? sanitisePdfText(value, regular) : "";

  const { report, letterhead } = input;
  const usable = PAGE_W - MARGIN * 2;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = await drawLetterhead(pdf, page, letterhead, {
    pageWidth: PAGE_W,
    pageHeight: PAGE_H,
    margin: MARGIN,
    fonts,
  });
  drawLetterheadFooter(page, letterhead, {
    margin: MARGIN,
    font: regular,
    note: clean(report.footerNote),
  });

  // --- Title block ----------------------------------------------------------
  page.drawText(truncate(clean(report.title), bold, 14, usable), {
    x: MARGIN,
    y,
    size: 14,
    font: bold,
    color: INK,
  });
  y -= 15;

  if (report.subtitle) {
    page.drawText(truncate(clean(report.subtitle), regular, 8.5, usable), {
      x: MARGIN,
      y,
      size: 8.5,
      font: regular,
      color: MUTED,
    });
    y -= 11;
  }
  if (report.meta) {
    page.drawText(truncate(clean(report.meta), regular, 7, usable), {
      x: MARGIN,
      y,
      size: 7,
      font: regular,
      color: MUTED,
    });
    y -= 10;
  }
  y -= 8;

  // --- Table ----------------------------------------------------------------
  const columns = report.columns.slice(0, 12);
  const columnWidth = usable / Math.max(1, columns.length);
  const rowHeight = 14;
  const bottom = MARGIN + 20;

  const drawHeader = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - 12,
      width: usable,
      height: 15,
      color: rgb(0.96, 0.967, 0.975),
    });
    columns.forEach((column, index) => {
      const text = truncate(clean(column.label), bold, 7.5, columnWidth - 8);
      const width = bold.widthOfTextAtSize(text, 7.5);
      page.drawText(text, {
        x: column.numeric
          ? MARGIN + (index + 1) * columnWidth - 4 - width
          : MARGIN + index * columnWidth + 4,
        y: y - 8,
        size: 7.5,
        font: bold,
        color: MUTED,
      });
    });
    y -= 15;
    page.drawRectangle({ x: MARGIN, y: y + 2, width: usable, height: 0.5, color: RULE });
    // Clear air under the rule, or the first row sits on the header and the
    // table reads as one run-on block.
    y -= 12;
  };

  drawHeader();

  report.rows.forEach((row, rowIndex) => {
    if (y - rowHeight < bottom) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      drawLetterheadFooter(page, letterhead, {
        margin: MARGIN,
        font: regular,
        note: clean(report.footerNote),
      });
      y = PAGE_H - MARGIN;
      // Continuation pages carry the report's name, not the whole
      // letterhead: the reader knows what they are holding by page three.
      page.drawText(truncate(clean(report.title), bold, 9, usable), {
        x: MARGIN,
        y,
        size: 9,
        font: bold,
        color: MUTED,
      });
      y -= 18;
      drawHeader();
    }

    if (rowIndex % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 4,
        width: usable,
        height: rowHeight,
        color: ZEBRA,
      });
    }

    columns.forEach((column, index) => {
      const raw = clean(row[column.key] ?? "");
      const text = truncate(raw, regular, 8, columnWidth - 8);
      const width = regular.widthOfTextAtSize(text, 8);
      page.drawText(text, {
        x: column.numeric
          ? MARGIN + (index + 1) * columnWidth - 4 - width
          : MARGIN + index * columnWidth + 4,
        y,
        size: 8,
        font: regular,
        color: INK,
      });
    });

    y -= rowHeight;
  });

  // --- The narrative --------------------------------------------------------
  if (report.narrative) {
    const needed = 60;
    if (y - needed < bottom) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      drawLetterheadFooter(page, letterhead, {
        margin: MARGIN,
        font: regular,
        note: clean(report.footerNote),
      });
      y = PAGE_H - MARGIN;
    }

    y -= 14;
    page.drawRectangle({ x: MARGIN, y: y + 8, width: usable, height: 0.5, color: RULE });

    page.drawText(truncate(clean(report.narrative.heading), bold, 10, usable), {
      x: MARGIN,
      y,
      size: 10,
      font: bold,
      color: INK,
    });
    y -= 14;

    for (const line of wrap(clean(report.narrative.body), regular, 8.5, usable)) {
      if (y < bottom) break;
      page.drawText(line, { x: MARGIN, y, size: 8.5, font: regular, color: INK });
      y -= 11;
    }

    for (const finding of report.narrative.findings ?? []) {
      if (y < bottom + 12) break;
      y -= 4;
      page.drawText("•", { x: MARGIN, y, size: 8.5, font: regular, color: MUTED });
      for (const line of wrap(clean(finding), regular, 8.5, usable - 12)) {
        if (y < bottom) break;
        page.drawText(line, { x: MARGIN + 12, y, size: 8.5, font: regular, color: INK });
        y -= 11;
      }
    }

    y -= 6;
    page.drawText(
      "Narrative generated from the figures above. Check any number before quoting it.",
      { x: MARGIN, y, size: 6.5, font: italic, color: MUTED },
    );
  }

  return Buffer.from(await pdf.save());
}
