import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import {
  drawLetterhead,
  drawLetterheadFooter,
  type Letterhead,
} from "@/lib/letterhead";
import { sanitisePdfText } from "@/lib/pdf-text";
import type { BoardReport } from "@/lib/board-report";
import { completeness, gapLabel, gaps, printable } from "@/lib/board-report-rules";

/**
 * The report to the board, as the paper that goes round the table.
 *
 * Portrait, not landscape: this is prose and figures rather than a table, and
 * it is read in a meeting alongside an agenda on A4.
 *
 * The gaps go on the front, under the summary. A board handed twenty figures
 * does not notice that six of them are absent, and the whole reason for
 * admitting a gap is that somebody asks about it.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const RULE = rgb(0.88, 0.9, 0.93);
const WARN = rgb(0.72, 0.45, 0.05);

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
    lines.push(current);
  }
  return lines;
}

export async function renderBoardReportPdf(input: {
  letterhead: Letterhead;
  report: BoardReport;
  preparedBy: string;
}): Promise<Buffer> {
  const { letterhead, report, preparedBy } = input;

  const pdf = await PDFDocument.create();
  pdf.setProducer("School Management System");
  pdf.setTitle(`Report to the board: ${report.period.label}`);
  pdf.setCreationDate(new Date());

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const usable = PAGE_W - MARGIN * 2;
  const sections = printable(report.sections);
  const state = completeness(sections);
  const holes = gaps(sections);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = await drawLetterhead(pdf, page, letterhead, {
    pageWidth: PAGE_W,
    pageHeight: PAGE_H,
    margin: MARGIN,
    fonts: { regular, bold, italic },
  });

  const text = (
    value: string,
    options: {
      size?: number;
      font?: PDFFont;
      colour?: typeof INK;
      indent?: number;
      width?: number;
      gap?: number;
    } = {},
  ) => {
    const size = options.size ?? 9.5;
    const font = options.font ?? regular;
    const width = options.width ?? usable - (options.indent ?? 0);

    // Sanitised against the font that will actually draw it: the cedi sign
    // and the Ghanaian vowels are not in WinAnsi, and pdf-lib throws rather
    // than dropping them, which turns a board paper into a 500.
    for (const line of wrap(sanitisePdfText(value, font), font, size, width)) {
      if (y < MARGIN + 60) {
        drawLetterheadFooter(page, letterhead, { margin: MARGIN, font: regular });
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
      }
      page.drawText(line, {
        x: MARGIN + (options.indent ?? 0),
        y,
        size,
        font,
        color: options.colour ?? INK,
      });
      y -= size + 3;
    }
    y -= options.gap ?? 0;
  };

  const rule = () => {
    if (y < MARGIN + 60) {
      drawLetterheadFooter(page, letterhead, { margin: MARGIN, font: regular });
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.6,
      color: RULE,
    });
    y -= 12;
  };

  // --- The front ------------------------------------------------------------

  y -= 6;
  text("Report to the board", { size: 17, font: bold, gap: 2 });
  text(report.period.label, { size: 11, colour: MUTED, gap: 6 });

  text(
    `Prepared by ${preparedBy} on ${report.generatedAt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}. Covering the term to ${report.period.to.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}.`,
    { size: 9, colour: MUTED, gap: 8 },
  );

  text(state.wording, { size: 9.5, gap: 4 });

  text(
    "Every figure below says what it counted. Anything here can be checked against the screen it came from, which is the point of it being one document rather than six.",
    { size: 9, colour: MUTED, gap: 10 },
  );

  if (holes.length) {
    text("What the school cannot yet state", { size: 10.5, font: bold, gap: 3 });
    for (const hole of holes) {
      text(`${gapLabel(hole)}. ${hole.why}`, {
        size: 8.5,
        colour: MUTED,
        indent: 10,
        gap: 1,
      });
    }
    y -= 6;
  }

  // --- The sections ---------------------------------------------------------

  for (const section of sections) {
    rule();
    text(section.title, { size: 12, font: bold, gap: 1 });
    if (section.blurb) text(section.blurb, { size: 9, colour: MUTED, gap: 5 });

    for (const entry of section.figures) {
      if (entry.value === null) {
        text(`${entry.label}: not available`, { size: 9.5, font: bold, colour: WARN, gap: 0 });
        text(entry.missing ?? "", { size: 8.5, colour: MUTED, indent: 10, gap: 4 });
        continue;
      }

      const headline = entry.change
        ? `${entry.label}: ${entry.value} (${entry.change.wording})`
        : `${entry.label}: ${entry.value}`;

      text(headline, { size: 9.5, font: bold, gap: 0 });
      text(entry.basis, { size: 8.5, colour: MUTED, indent: 10, gap: 4 });
    }

    for (const note of section.notes ?? []) {
      text(note, { size: 8.5, font: italic, colour: MUTED, gap: 4 });
    }
  }

  drawLetterheadFooter(page, letterhead, {
    margin: MARGIN,
    font: regular,
    note: "Report to the board",
  });

  // The page numbers go on last, when there is finally a total to put in them.
  const pages = pdf.getPages();
  pages.forEach((sheet, index) => {
    const label = `${index + 1} of ${pages.length}`;
    sheet.drawText(label, {
      x: PAGE_W - MARGIN - regular.widthOfTextAtSize(label, 8),
      y: MARGIN - 22,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });

  return Buffer.from(await pdf.save());
}
