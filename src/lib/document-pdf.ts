import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { drawLetterhead, drawLetterheadFooter, type Letterhead } from "@/lib/letterhead";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown";
import { sanitisePdfText } from "@/lib/pdf-text";

/**
 * A document somebody wrote, printed on the school's letterhead.
 *
 * The other renderers in here put a fixed shape on a page — a payslip has the
 * same rows every month, a report card the same table. This one lays out
 * whatever was typed, so it works in blocks and styled runs from
 * lib/markdown.ts rather than from a struct, and the same parse drives the
 * editor's preview. A preview that agrees with the paper only by coincidence
 * is worse than none, because people sign what the preview showed them.
 *
 * Wrapping is done across runs rather than across a string: "the **head**
 * said" is three runs in two faces, and measuring the sentence in one font
 * would break the line in the wrong place. Each word is measured in the face
 * it will actually be drawn in.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;
const USABLE = PAGE_W - MARGIN * 2;

const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.47, 0.56);
const FAINT = rgb(0.85, 0.88, 0.91);
const RULE = rgb(0.88, 0.9, 0.93);
const QUOTE_BAR = rgb(0.72, 0.76, 0.82);

const BODY_SIZE = 10.5;
const LINE = 15;

type Faces = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
};

function faceFor(run: Inline, faces: Faces): PDFFont {
  // Code carries weight too. Returning the plain Courier for every code run
  // meant a reference inside a heading printed lighter than the words either
  // side of it, which reads as a mistake rather than as a style.
  if (run.code) return run.bold ? faces.monoBold : faces.mono;
  if (run.bold && run.italic) return faces.boldItalic;
  if (run.bold) return faces.bold;
  if (run.italic) return faces.italic;
  return faces.regular;
}

/** One word, with the face it belongs to. Wrapping works on these. */
type Word = { text: string; font: PDFFont; size: number };

/**
 * Runs into measurable words, sanitised on the way.
 *
 * The encoder guard belongs here and not on the body as a whole. pdf-lib
 * rejects a newline outright, so sanitisePdfText's fallback — drop whatever
 * cannot be encoded, character by character — removed every line break in the
 * document. The parser is line-based, so the entire proposal arrived as one
 * paragraph with its headings, bullets and table printed as literal hashes,
 * dashes and pipes. It looked like a parser bug and was a sequencing one:
 * parse the text, then clean the leaves.
 */
function wordsOf(runs: Inline[], faces: Faces, size: number): Word[] {
  const words: Word[] = [];
  for (const run of runs) {
    const font = faceFor(run, faces);
    // Split on spaces but keep the run's own leading/trailing space as a gap,
    // so "the **head**" does not become "thehead".
    //
    // The split comes before the cleaning, not after. A tab is outside WinAnsi
    // just as a newline is, so cleaning first deleted it rather than turning
    // it into a gap: a line typed "Textbooks<tab>4,500" printed as
    // "Textbooks4,500", two columns of a hand-aligned list run together into
    // one number. The same sequencing lesson as the body, one level down.
    for (const piece of run.text.split(/(\s+)/)) {
      if (piece === "") continue;
      if (/^\s+$/.test(piece)) {
        words.push({ text: " ", font, size });
        continue;
      }
      const cleaned = sanitisePdfText(piece, font);
      if (cleaned !== "") words.push({ text: cleaned, font, size });
    }
  }
  return words;
}

/**
 * Splits a word that cannot fit a line of its own, at whatever character it
 * reaches the edge on.
 *
 * A greedy wrapper has no answer for a single token wider than the column: it
 * puts it on an empty line, the "does it fit" test passes because there is
 * nothing to compare against, and the word runs off the right edge of the
 * paper. In an HR letter that token is a URL, a bank account, or a reference
 * like GCS/HR/2026/014-REVISED-SECOND-DRAFT — and the part that falls off is
 * the part somebody needed.
 *
 * Broken rather than truncated: this is a document somebody signs, and losing
 * the end of an account number quietly is worse than an ugly break.
 */
function breakWord(word: Word, maxWidth: number): Word[] {
  if (word.font.widthOfTextAtSize(word.text, word.size) <= maxWidth) return [word];

  const pieces: Word[] = [];
  let current = "";
  for (const char of word.text) {
    const candidate = current + char;
    if (current && word.font.widthOfTextAtSize(candidate, word.size) > maxWidth) {
      pieces.push({ ...word, text: current });
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push({ ...word, text: current });
  return pieces;
}

/** Greedy wrap, measuring each word in its own face. */
function layout(input: Word[], maxWidth: number): Word[][] {
  // A column too narrow to hold anything would make breakWord produce one
  // piece per character for ever; nothing is drawn at that size anyway.
  if (maxWidth < 8) return [[]];

  const words = input.flatMap((word) => breakWord(word, maxWidth));

  const lines: Word[][] = [];
  let line: Word[] = [];
  let width = 0;

  for (const word of words) {
    const w = word.font.widthOfTextAtSize(word.text, word.size);

    // A space at the start of a line is not drawn.
    if (word.text === " " && line.length === 0) continue;

    if (width + w > maxWidth && line.length) {
      // Trailing spaces do not belong on the end of a wrapped line.
      while (line.length && line[line.length - 1].text === " ") line.pop();
      lines.push(line);
      line = [];
      width = 0;
      if (word.text === " ") continue;
    }

    line.push(word);
    width += w;
  }

  while (line.length && line[line.length - 1].text === " ") line.pop();
  if (line.length) lines.push(line);
  return lines.length ? lines : [[]];
}

export type WrittenDocument = {
  /** "STAFF DEVELOPMENT PROPOSAL" — printed under the letterhead. */
  title: string;
  /** "GCS/HR/2026/014", quoted in any reply. */
  reference?: string | null;
  /** "21 August 2026". */
  date: string;
  /** Addressee block, one line per row. Empty for a report. */
  addressee?: string[];
  salutation?: string | null;
  /** The document itself, as Markdown. */
  body: string;
  /**
   * Bodies that each start a fresh page, used instead of `body` when present.
   *
   * For a run of small documents that are one job — a class's worth of
   * candidate slips, an appendix that must not begin halfway down a sheet.
   * Rendering them as separate PDFs and merging would embed the fonts and the
   * crest once per slip, which for a year group is the same picture stored
   * sixty times.
   */
  sections?: string[];
  closing?: string | null;
  signatory?: { name: string; title: string } | null;
  /** Printed small under the signature — a validity note, a distribution list. */
  footnote?: string | null;
  /** Stamped across the page when the document is not final. */
  watermark?: string | null;
};

export async function renderDocumentPdf(input: {
  letterhead: Letterhead;
  document: WrittenDocument;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setProducer("School Management System");
  pdf.setCreationDate(new Date());
  pdf.setTitle(input.document.title);

  const faces: Faces = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await pdf.embedFont(StandardFonts.Courier),
    monoBold: await pdf.embedFont(StandardFonts.CourierBold),
  };

  // Every string meets the encoder once, here. pdf-lib throws from
  // widthOfTextAtSize as well as drawText, and this file measures before it
  // wraps — so a Twi name would take the render down before any ink.
  // The whitespace is flattened first. These fields are drawn as single lines,
  // and a tab or a stray newline pasted into a title is not encodable, so
  // cleaning it without flattening it deleted the gap and joined the words
  // either side of it.
  const clean = (value: string) =>
    sanitisePdfText(value.replace(/\s+/g, " ").trim(), faces.regular);
  const doc: WrittenDocument = {
    // body is deliberately absent from this list — see wordsOf.
    ...input.document,
    title: clean(input.document.title),
    reference: input.document.reference ? clean(input.document.reference) : null,
    date: clean(input.document.date),
    addressee: (input.document.addressee ?? []).map(clean),
    salutation: input.document.salutation ? clean(input.document.salutation) : null,
    closing: input.document.closing ? clean(input.document.closing) : null,
    signatory: input.document.signatory
      ? {
          name: clean(input.document.signatory.name),
          title: clean(input.document.signatory.title),
        }
      : null,
    footnote: input.document.footnote ? clean(input.document.footnote) : null,
    watermark: input.document.watermark ? clean(input.document.watermark) : null,
  };

  /**
   * The draft stamp, laid down before anything else on the sheet.
   *
   * pdf-lib paints in call order, so stamping in the final per-page pass put
   * it on top: on the costs table "4,500" came out as "' 500". A mark saying
   * the figures are provisional should not be the reason they cannot be read.
   */
  function stamp(sheet: PDFPage) {
    if (!doc.watermark) return;
    sheet.drawText(doc.watermark.toUpperCase(), {
      x: 96,
      y: 250,
      size: 76,
      font: faces.bold,
      color: rgb(0.93, 0.94, 0.96),
      rotate: { type: "degrees", angle: 38 } as never,
    });
  }

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  stamp(page);
  let y = await drawLetterhead(pdf, page, input.letterhead, {
    pageWidth: PAGE_W,
    pageHeight: PAGE_H,
    margin: MARGIN,
    fonts: { regular: faces.regular, bold: faces.bold, italic: faces.italic },
  });

  const pages: PDFPage[] = [page];

  /** A new sheet, with a slim continuation line rather than the full crest. */
  function nextPage() {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    stamp(page);
    pages.push(page);
    y = PAGE_H - MARGIN;
    page.drawText(
      `${doc.title}${doc.reference ? `  ·  ${doc.reference}` : ""}`,
      { x: MARGIN, y, size: 7.5, font: faces.regular, color: MUTED },
    );
    page.drawLine({
      start: { x: MARGIN, y: y - 6 },
      end: { x: MARGIN + USABLE, y: y - 6 },
      thickness: 0.5,
      color: RULE,
    });
    y -= 26;
  }

  /** Make room, breaking the page when there is not enough. */
  function room(needed: number) {
    if (y - needed < MARGIN + 24) nextPage();
  }

  function drawLines(
    lines: Word[][],
    options: {
      indent?: number;
      leading?: number;
      colour?: ReturnType<typeof rgb>;
      /** A margin bar beside every line — the quotation rule. */
      bar?: ReturnType<typeof rgb>;
    },
  ) {
    const indent = options.indent ?? 0;
    const leading = options.leading ?? LINE;
    for (const line of lines) {
      room(leading);
      if (options.bar) {
        // A segment per line, drawn on whichever page the line landed on.
        // Measuring the bar from the y before to the y after assumes both are
        // on the same sheet: when a quotation crossed a page the second y was
        // near the top of the new one, the height came out negative, and the
        // guard against drawing it upside down dropped the bar altogether —
        // so the longest quotations were the ones that lost their mark.
        page.drawRectangle({
          x: MARGIN,
          y: y - 3,
          width: 2,
          height: leading,
          color: options.bar,
        });
      }
      let x = MARGIN + indent;
      for (const word of line) {
        page.drawText(word.text, {
          x,
          y,
          size: word.size,
          font: word.font,
          color: options.colour ?? INK,
        });
        x += word.font.widthOfTextAtSize(word.text, word.size);
      }
      y -= leading;
    }
  }

  // --- Reference and date ----------------------------------------------------
  if (doc.reference) {
    page.drawText(doc.reference, { x: MARGIN, y, size: 8.5, font: faces.regular, color: MUTED });
  }
  const dateWidth = faces.regular.widthOfTextAtSize(doc.date, 8.5);
  page.drawText(doc.date, {
    x: MARGIN + USABLE - dateWidth,
    y,
    size: 8.5,
    font: faces.regular,
    color: MUTED,
  });
  y -= 26;

  // --- Addressee -------------------------------------------------------------
  for (const line of doc.addressee ?? []) {
    if (!line) continue;
    room(13);
    page.drawText(line, { x: MARGIN, y, size: 9.5, font: faces.regular, color: INK });
    y -= 13;
  }
  if ((doc.addressee ?? []).length) y -= 12;

  // --- Title -----------------------------------------------------------------
  const titleLines = layout(
    wordsOf([{ text: doc.title.toUpperCase(), bold: true }], faces, 12),
    USABLE,
  );
  drawLines(titleLines, { leading: 16 });
  page.drawLine({
    start: { x: MARGIN, y: y + 9 },
    end: { x: MARGIN + Math.min(USABLE, 150), y: y + 9 },
    thickness: 0.9,
    color: INK,
  });
  y -= 14;

  if (doc.salutation) {
    room(LINE);
    page.drawText(doc.salutation, {
      x: MARGIN,
      y,
      size: BODY_SIZE,
      font: faces.regular,
      color: INK,
    });
    y -= LINE + 4;
  }

  // --- The document ----------------------------------------------------------
  // Sections when there are any, and the body otherwise. An empty section is
  // skipped rather than given a blank page of its own.
  const bodies = (doc.sections?.length ? doc.sections : [doc.body]).filter((part) =>
    part.trim(),
  );

  for (const [at, part] of bodies.entries()) {
    if (at > 0) nextPage();
    for (const block of parseMarkdown(part)) {
      drawBlock(block);
    }
  }

  function drawBlock(block: Block) {
    switch (block.type) {
      case "rule": {
        room(18);
        page.drawLine({
          start: { x: MARGIN, y: y + 4 },
          end: { x: MARGIN + USABLE, y: y + 4 },
          thickness: 0.6,
          color: RULE,
        });
        y -= 16;
        return;
      }

      case "heading": {
        const size = block.level === 1 ? 13 : block.level === 2 ? 11.5 : 10.5;
        y -= block.level === 1 ? 8 : 6;
        // A heading with nothing under it belongs on the next page with its
        // text, not stranded at the foot of this one.
        room(size + LINE + 6);
        // Promoted at the run, not at the word. Swapping the face afterwards
        // only caught words that came out in the regular face, so a heading
        // like "## The *provisional* figures" printed its italic word in plain
        // oblique beside bold ones — the one word being emphasised was the one
        // word that lost the weight of the heading. Asking for the bold form
        // of each run gets the bold-italic and the bold monospace too.
        const runs = block.runs.map((run) => ({ ...run, bold: true }));
        drawLines(layout(wordsOf(runs, faces, size), USABLE), {
          leading: size + 5,
        });
        y -= 4;
        return;
      }

      case "paragraph": {
        drawLines(layout(wordsOf(block.runs, faces, BODY_SIZE), USABLE), {});
        y -= 5;
        return;
      }

      case "quote": {
        const indent = 16;
        const lines = layout(wordsOf(block.runs, faces, BODY_SIZE), USABLE - indent);
        drawLines(lines, { indent, colour: MUTED, bar: QUOTE_BAR });
        y -= 6;
        return;
      }

      case "list": {
        const indent = 18;
        for (const [at, item] of block.items.entries()) {
          const marker = block.ordered ? `${at + 1}.` : "•";
          const lines = layout(wordsOf(item, faces, BODY_SIZE), USABLE - indent);
          room(LINE);
          // The marker sits on the first line's baseline, hanging left of the
          // text, so a wrapped item lines up under itself rather than under
          // its own bullet.
          page.drawText(marker, {
            x: MARGIN + 2,
            y,
            size: BODY_SIZE,
            font: faces.regular,
            color: MUTED,
          });
          drawLines(lines, { indent });
          y -= 2;
        }
        y -= 5;
        return;
      }

      case "table": {
        const columns = Math.max(block.header.length, 1);
        const columnWidth = USABLE / columns;
        const cellSize = 9.5;

        // The most lines of a cell that fit on a sheet of their own.
        const perPage = Math.max(1, Math.floor((PAGE_H - MARGIN * 2 - 60) / 13));

        const drawRow = (cells: Inline[][], bold: boolean) => {
          const wrapped = cells.map((cell) =>
            layout(
              wordsOf(
                bold ? cell.map((run) => ({ ...run, bold: true })) : cell,
                faces,
                cellSize,
              ),
              columnWidth - 12,
            ),
          );
          const tallest = Math.max(...wrapped.map((lines) => lines.length), 1);

          // A row is drawn in bands, each short enough for a page. room()
          // breaks the page once and then draws whatever it was given, so a
          // row taller than a whole sheet — a pasted paragraph in one cell of
          // a policy table — carried on down past the footer and off the
          // paper. Every column advances to the next band together, so the
          // cells stay in their columns across the break.
          for (let start = 0; start < tallest; start += perPage) {
            const band = wrapped.map((lines) => lines.slice(start, start + perPage));
            const height = Math.max(...band.map((lines) => lines.length), 1) * 13 + 6;
            room(height);

            if (bold) {
              page.drawRectangle({
                x: MARGIN,
                y: y - height + 11,
                width: USABLE,
                height,
                color: rgb(0.96, 0.97, 0.98),
              });
            }

            for (const [index, lines] of band.entries()) {
              let lineY = y;
              for (const line of lines) {
                let x = MARGIN + index * columnWidth + 6;
                for (const word of line) {
                  page.drawText(word.text, {
                    x,
                    y: lineY,
                    size: word.size,
                    font: word.font,
                    color: INK,
                  });
                  x += word.font.widthOfTextAtSize(word.text, word.size);
                }
                lineY -= 13;
              }
            }

            y -= height;
          }

          page.drawLine({
            start: { x: MARGIN, y: y + 9 },
            end: { x: MARGIN + USABLE, y: y + 9 },
            thickness: 0.4,
            color: FAINT,
          });
        };

        y -= 4;
        drawRow(block.header, true);
        for (const row of block.rows) drawRow(row, false);
        y -= 10;
        return;
      }
    }
  }

  // --- Signature -------------------------------------------------------------
  if (doc.closing || doc.signatory) {
    // The footnote is claimed here too. Reserved separately it landed alone on
    // a page of its own, which reads as a second sheet somebody forgot to
    // throw away rather than as a note under a signature.
    room(74 + (doc.footnote ? 24 : 0));
    y -= 12;
    if (doc.closing) {
      page.drawText(doc.closing, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font: faces.regular,
        color: INK,
      });
      y -= 42;
    }
    if (doc.signatory) {
      page.drawLine({
        start: { x: MARGIN, y: y + 10 },
        end: { x: MARGIN + 180, y: y + 10 },
        thickness: 0.6,
        color: FAINT,
      });
      page.drawText(doc.signatory.name, {
        x: MARGIN,
        y,
        size: BODY_SIZE,
        font: faces.bold,
        color: INK,
      });
      y -= 13;
      page.drawText(doc.signatory.title, {
        x: MARGIN,
        y,
        size: 9,
        font: faces.regular,
        color: MUTED,
      });
      y -= 16;
    }
  }

  if (doc.footnote) {
    room(20);
    for (const line of layout(
      wordsOf([{ text: doc.footnote, italic: true }], faces, 8),
      USABLE,
    )) {
      let x = MARGIN;
      for (const word of line) {
        page.drawText(word.text, { x, y, size: 8, font: word.font, color: MUTED });
        x += word.font.widthOfTextAtSize(word.text, word.size);
      }
      y -= 11;
    }
  }

  // --- Every page ------------------------------------------------------------
  for (const [index, sheet] of pages.entries()) {
    drawLetterheadFooter(sheet, input.letterhead, {
      margin: MARGIN,
      font: faces.regular,
      note: pages.length > 1 ? `Page ${index + 1} of ${pages.length}` : undefined,
    });
  }

  return Buffer.from(await pdf.save());
}
