import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import type { EmbeddedImage } from "@/lib/document-images";
import { sanitisePdfText } from "@/lib/pdf-text";

/**
 * A week's timetable as a landscape A4 grid — the sheet that actually gets
 * taped to the classroom wall and pinned on the staffroom board.
 *
 * One renderer serves both shapes of the question: a class's week (cells
 * carry subject, teacher, room) and a teacher's week (cells carry class,
 * subject, room). The caller decides what a row is — a class numbers its
 * periods, a teacher's day is keyed by the clock — and passes rows of five
 * cells; this file only draws.
 */

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 36;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const FAINT = rgb(0.85, 0.88, 0.91);
const BREAK_BG = rgb(0.955, 0.96, 0.97);
const WHITE = rgb(1, 1, 1);

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(value)) return rgb(0.17, 0.4, 0.81);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (maxWidth <= 4) return "";
  let value = text;
  while (font.widthOfTextAtSize(value, size) > maxWidth && value.length > 1) {
    value = value.slice(0, -1);
  }
  return value === text ? value : `${value.slice(0, -1)}…`;
}

export type TimetableCell = {
  /** Bold first line: the subject (class view) or the class (teacher view). */
  title: string;
  /** Second line: the teacher or the subject. */
  line2?: string | null;
  /** Third line: the room, and per-cell times when they differ from the row. */
  line3?: string | null;
  /** Subject colour chip, when the subject has one. */
  colour?: string | null;
};

export type TimetableRow = {
  /** Left-column label: "1" with times, or a bare time range. */
  label: string;
  sublabel?: string | null;
  /** A full-width shaded row: assembly, break, lunch. */
  breakLabel?: string | null;
  /** One per day column; null is a free period. */
  cells: Array<TimetableCell | null>;
};

export type TimetableSheet = {
  school: { name: string };
  crest?: EmbeddedImage | null;
  brandHex: string;
  /** "JHS 2 Amber" or the teacher's name. */
  title: string;
  /** "Timetable · 2026/2027, Term 1" */
  subtitle?: string | null;
  days: string[];
  rows: TimetableRow[];
};

export async function renderTimetablePdf(input: TimetableSheet): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setProducer("School Management System");
  pdf.setCreationDate(new Date());

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = hexToRgb(input.brandHex);

  const clean = (value: string | null | undefined) =>
    value ? sanitisePdfText(value, regular) : value ?? null;
  const schoolName = clean(input.school.name) ?? "";
  const title = clean(input.title) ?? "";
  const subtitle = clean(input.subtitle);
  const days = input.days.map((day) => clean(day) ?? "");
  const rows = input.rows.map((row) => ({
    label: clean(row.label) ?? "",
    sublabel: clean(row.sublabel),
    breakLabel: clean(row.breakLabel),
    cells: row.cells.map((cell) =>
      cell
        ? {
            title: clean(cell.title) ?? "",
            line2: clean(cell.line2),
            line3: clean(cell.line3),
            colour: cell.colour ?? null,
          }
        : null,
    ),
  }));

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const usable = PAGE_W - MARGIN * 2;

  // --- Masthead -------------------------------------------------------------
  let y = PAGE_H - MARGIN;

  if (input.crest) {
    const embedded = await (async () => {
      try {
        return input.crest!.mimeType.includes("png")
          ? await pdf.embedPng(input.crest!.bytes)
          : await pdf.embedJpg(input.crest!.bytes);
      } catch {
        return null;
      }
    })();
    if (embedded) {
      const box = 36;
      const scale = Math.min(box / embedded.width, box / embedded.height);
      page.drawImage(embedded, {
        x: MARGIN + usable - embedded.width * scale,
        y: y - embedded.height * scale + 6,
        width: embedded.width * scale,
        height: embedded.height * scale,
      });
    }
  }

  page.drawText(truncate(schoolName, bold, 13, usable - 48), {
    x: MARGIN,
    y,
    size: 13,
    font: bold,
    color: INK,
  });
  y -= 17;
  const shownTitle = truncate(title, bold, 11, usable - 48);
  page.drawText(shownTitle, {
    x: MARGIN,
    y,
    size: 11,
    font: bold,
    color: brand,
  });
  if (subtitle) {
    const titleW = bold.widthOfTextAtSize(shownTitle, 11);
    page.drawText(truncate(subtitle, regular, 8, usable - 48 - titleW - 8), {
      x: MARGIN + titleW + 8,
      y: y + 1,
      size: 8,
      font: regular,
      color: MUTED,
    });
  }
  // 18, not 12: a 36pt crest bottom-anchors 30pt below the masthead top,
  // and the day-header band must start below it, not shave its edge off.
  y -= 18;

  // --- Grid geometry --------------------------------------------------------
  const labelW = 64;
  const dayW = (usable - labelW) / input.days.length;
  const headerH = 18;
  const gridTop = y;
  const gridBottom = MARGIN + 12;
  const breakH = 14;
  const lessonRows = rows.filter((row) => !row.breakLabel).length;
  const breakRows = rows.length - lessonRows;
  const rowH = Math.min(
    52,
    (gridTop - gridBottom - headerH - breakRows * breakH) / Math.max(1, lessonRows),
  );

  // --- Day header row -------------------------------------------------------
  page.drawRectangle({
    x: MARGIN,
    y: gridTop - headerH,
    width: usable,
    height: headerH,
    color: brand,
  });
  days.forEach((day, index) => {
    const w = bold.widthOfTextAtSize(day, 8);
    page.drawText(day, {
      x: MARGIN + labelW + index * dayW + (dayW - w) / 2,
      y: gridTop - headerH + 5.5,
      size: 8,
      font: bold,
      color: WHITE,
    });
  });

  // --- Rows -----------------------------------------------------------------
  let rowTop = gridTop - headerH;

  for (const row of rows) {
    const height = row.breakLabel ? breakH : rowH;
    const bottom = rowTop - height;
    if (bottom < gridBottom - 1) break; // over-tall timetables clip, never overflow

    if (row.breakLabel) {
      page.drawRectangle({
        x: MARGIN,
        y: bottom,
        width: usable,
        height,
        color: BREAK_BG,
      });
      const text = row.label ? `${row.breakLabel}  ·  ${row.label}` : row.breakLabel;
      const w = regular.widthOfTextAtSize(text, 6.5);
      page.drawText(text, {
        x: MARGIN + (usable - w) / 2,
        y: bottom + height / 2 - 2.5,
        size: 6.5,
        font: regular,
        color: MUTED,
      });
    } else {
      page.drawText(row.label, {
        x: MARGIN + 6,
        y: rowTop - 12,
        size: 7,
        font: bold,
        color: INK,
      });
      if (row.sublabel && rowH >= 24) {
        page.drawText(row.sublabel, {
          x: MARGIN + 6,
          y: rowTop - 21,
          size: 5.5,
          font: regular,
          color: MUTED,
        });
      }

      row.cells.forEach((cell, index) => {
        if (!cell) return;
        const cellX = MARGIN + labelW + index * dayW;
        const inset = 6;
        const maxW = dayW - inset * 2;
        let textX = cellX + inset;
        const lineOne = rowTop - 12;

        if (cell.colour) {
          page.drawCircle({
            x: cellX + inset + 2,
            y: lineOne + 2,
            size: 2,
            color: hexToRgb(cell.colour),
          });
          textX += 7;
        }
        page.drawText(truncate(cell.title, bold, 7, maxW - (cell.colour ? 7 : 0)), {
          x: textX,
          y: lineOne,
          size: 7,
          font: bold,
          color: INK,
        });
        if (cell.line2 && rowH >= 28) {
          page.drawText(truncate(cell.line2, regular, 6, maxW), {
            x: cellX + inset,
            y: lineOne - 9,
            size: 6,
            font: regular,
            color: MUTED,
          });
        }
        if (cell.line3 && rowH >= 36) {
          page.drawText(truncate(cell.line3, regular, 6, maxW), {
            x: cellX + inset,
            y: lineOne - 17,
            size: 6,
            font: regular,
            color: MUTED,
          });
        }
      });
    }

    page.drawRectangle({
      x: MARGIN,
      y: bottom,
      width: usable,
      height: 0.5,
      color: FAINT,
    });
    rowTop = bottom;
  }

  // --- Column rules and outer frame ----------------------------------------
  for (let index = 0; index <= input.days.length; index += 1) {
    page.drawRectangle({
      x: MARGIN + labelW + index * dayW,
      y: rowTop,
      width: 0.5,
      height: gridTop - rowTop,
      color: FAINT,
    });
  }
  page.drawRectangle({
    x: MARGIN,
    y: rowTop,
    width: usable,
    height: gridTop - rowTop,
    borderColor: FAINT,
    borderWidth: 0.75,
  });

  return Buffer.from(await pdf.save());
}
