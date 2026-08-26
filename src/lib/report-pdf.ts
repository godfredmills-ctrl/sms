import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import {
  drawLetterhead,
  drawLetterheadFooter,
  type Letterhead,
} from "@/lib/letterhead";
import { sanitisePdfText } from "@/lib/pdf-text";
import {
  formatMeasure,
  type Breakdown,
  type ReportSummary,
} from "@/lib/report-stats";

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
  /** Key figures, breakdowns and gaps, derived from the rows. */
  summary?: ReportSummary | null;
  /**
   * How many rows the summary was actually computed over, when that is fewer
   * than the report returned.
   *
   * A ReportRun stores the first 500 rows, not all of them, so a mean printed
   * under a subtitle reading "3,200 rows" is a mean of 500 of them. The
   * subtitle already says the TABLE is truncated; the figures needed to say
   * it too, because a board reads a mean as a fact about the whole thing.
   */
  summarySampleOf?: { shown: number; total: number } | null;
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

  // --- The analysis ---------------------------------------------------------
  // A reader meets the findings first and the four hundred rows afterwards,
  // because a table is evidence and this is the report.
  const summary = report.summary;

  const sectionHeading = (text: string) => {
    page.drawText(clean(text).toUpperCase(), {
      x: MARGIN,
      y,
      size: 7,
      font: bold,
      color: MUTED,
    });
    y -= 6;
    page.drawRectangle({ x: MARGIN, y, width: usable, height: 0.5, color: RULE });
    y -= 14;
  };

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    drawLetterheadFooter(page, letterhead, {
      margin: MARGIN,
      font: regular,
      note: clean(report.footerNote),
    });
    y = PAGE_H - MARGIN;
    page.drawText(truncate(clean(report.title), bold, 9, usable), {
      x: MARGIN,
      y,
      size: 9,
      font: bold,
      color: MUTED,
    });
    y -= 20;
  };

  if (summary?.numerics.length) {
    const sample = report.summarySampleOf;
    sectionHeading(
      sample && sample.shown < sample.total
        ? `Key figures: first ${sample.shown.toLocaleString()} of ${sample.total.toLocaleString()} rows`
        : "Key figures",
    );

    // One tile per numeric column: the total is the headline, with the
    // spread underneath — a mean without a range hides the outlier that is
    // usually the point.
    const tiles = summary.numerics.slice(0, 4);
    const tileWidth = usable / tiles.length;
    const tileHeight = 46;

    tiles.forEach((figure, index) => {
      const x = MARGIN + index * tileWidth;
      page.drawRectangle({
        x,
        y: y - tileHeight + 12,
        width: tileWidth - 8,
        height: tileHeight,
        color: rgb(0.965, 0.972, 0.98),
      });
      page.drawText(
        truncate(
          clean(`${figure.label}, ${figure.headlineLabel.toLowerCase()}`),
          regular,
          6.5,
          tileWidth - 20,
        ),
        { x: x + 8, y: y + 1, size: 6.5, font: regular, color: MUTED },
      );
      page.drawText(
        truncate(clean(formatMeasure(figure.headline, figure.type)), bold, 13, tileWidth - 20),
        { x: x + 8, y: y - 14, size: 13, font: bold, color: INK },
      );
      page.drawText(
        truncate(
          clean(
            (figure.headlineLabel === "Total"
              ? `avg ${formatMeasure(figure.mean, figure.type)}  ·  `
              : `${figure.count} rows  ·  `) +
              `${formatMeasure(figure.min, figure.type)}-${formatMeasure(figure.max, figure.type)}`,
          ),
          regular,
          6,
          tileWidth - 20,
        ),
        { x: x + 8, y: y - 26, size: 6, font: regular, color: MUTED },
      );
    });

    y -= tileHeight + 18;
  }

  if (summary?.breakdowns.length) {
    // Two side by side, so four breakdowns are two rows rather than four
    // pages of half-empty tables.
    const perRow = 2;
    const columnWidth = usable / perRow;

    for (let index = 0; index < summary.breakdowns.length; index += perRow) {
      const pair = summary.breakdowns.slice(index, index + perRow);
      const tallest = Math.max(...pair.map((entry) => entry.rows.length));
      const needed = tallest * 12 + 40;
      if (y - needed < MARGIN + 30) newPage();

      if (index === 0) sectionHeading("Breakdown");
      const top = y;

      pair.forEach((breakdown: Breakdown, column) => {
        const x = MARGIN + column * columnWidth;
        const inner = columnWidth - 16;
        let rowY = top;

        page.drawText(truncate(clean(breakdown.label), bold, 8, inner), {
          x,
          y: rowY,
          size: 8,
          font: bold,
          color: INK,
        });
        rowY -= 12;

        const widest = Math.max(...breakdown.rows.map((entry) => entry.count), 1);

        for (const entry of breakdown.rows) {
          // A bar behind the label: the shape of the distribution reads
          // before any of the numbers do.
          const barWidth = (entry.count / widest) * (inner * 0.55);
          page.drawRectangle({
            x,
            y: rowY - 2.5,
            width: Math.max(barWidth, 0.6),
            height: 8,
            color: rgb(0.87, 0.91, 0.97),
          });
          page.drawText(truncate(clean(entry.value), regular, 7, inner * 0.5), {
            x: x + 3,
            y: rowY,
            size: 7,
            font: regular,
            color: INK,
          });

          const right = clean(
            `${entry.count}  ·  ${entry.percent.toFixed(0)}%` +
              (entry.measure !== undefined && breakdown.measureType
                ? `  ·  ${formatMeasure(entry.measure, breakdown.measureType)}`
                : ""),
          );
          const rightText = truncate(right, regular, 7, inner * 0.45);
          const rightWidth = regular.widthOfTextAtSize(rightText, 7);
          page.drawText(rightText, {
            x: x + inner - rightWidth,
            y: rowY,
            size: 7,
            font: regular,
            color: MUTED,
          });
          rowY -= 12;
        }

        if (breakdown.otherCount) {
          page.drawText(`and ${breakdown.otherCount} more`, {
            x,
            y: rowY,
            size: 6,
            font: italic,
            color: MUTED,
          });
        }
      });

      y = top - tallest * 12 - 20;
    }
  }

  if (summary?.gaps.length) {
    const needed = summary.gaps.length * 11 + 30;
    if (y - needed < MARGIN + 30) newPage();

    sectionHeading("What is missing");
    for (const gap of summary.gaps) {
      page.drawText(
        truncate(
          `${clean(gap.label)}, ${gap.filled} of ${gap.total} rows filled (${gap.percent.toFixed(0)}%)`,
          regular,
          7.5,
          usable,
        ),
        { x: MARGIN, y, size: 7.5, font: regular, color: INK },
      );
      y -= 11;
    }
    y -= 10;
  }

  // --- Table ----------------------------------------------------------------
  if (summary && y < MARGIN + 120) newPage();
  if (summary) sectionHeading("The detail");

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
