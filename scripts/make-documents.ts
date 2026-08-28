/**
 * Renders the manual and the proposal as PDFs.
 *
 * These are documents about the system rather than documents the system
 * produces for a school, so they are built here rather than being a feature.
 * They deliberately carry no crest and no school letterhead: the manual belongs
 * to the software, not to any one school, and a crest on it would be wrong the
 * moment a second school read it.
 *
 * The Markdown is parsed with the same module the rest of the system uses, so
 * the tables, headings and lists behave the way they do everywhere else and
 * the forty eight parser tests cover this too.
 *
 *   npx tsx --conditions=react-server scripts/make-documents.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { parseMarkdown, type Block, type Inline } from "../src/lib/markdown";
import { sanitisePdfText } from "../src/lib/pdf-text";

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const MARGIN = 62;
const USABLE = PAGE_W - MARGIN * 2;

const INK = rgb(0.09, 0.11, 0.15);
const MUTED = rgb(0.42, 0.47, 0.55);
const RULE = rgb(0.85, 0.87, 0.9);
const BAND = rgb(0.96, 0.97, 0.98);

/*
 * The palette comes off the Mills Technologies mark rather than being chosen
 * beside it. The deep indigo is the ground the logo is drawn on, sampled from
 * the file; the violet is the bird itself. A document whose accent colour is
 * a different blue from the logo at the top of it looks like two documents.
 */
const NAVY = rgb(0.055, 0.0, 0.4); // #0e0066, the top of the logo ground
const NAVY_DEEP = rgb(0.027, 0.0, 0.196); // #070032, the bottom of it
const VIOLET = rgb(0.373, 0.325, 1); // #5f53ff, the mark
const ACCENT = VIOLET;

/** Who made it. On the cover, and in the footer of every page after it. */
const VENDOR = "Mills Technologies";

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; mono: PDFFont };

/** Flattens inline runs to plain text, keeping which parts are emphasised. */
type Piece = { text: string; bold: boolean; italic: boolean; code: boolean };

function pieces(runs: Inline[]): Piece[] {
  // Inline runs from the shared parser are already flat: each carries its own
  // text and its own emphasis flags. There is no tree to walk.
  return runs.map((run) => ({
    text: run.text,
    bold: run.bold ?? false,
    italic: run.italic ?? false,
    code: run.code ?? false,
  }));
}

function fontFor(piece: Piece, fonts: Fonts): PDFFont {
  if (piece.code) return fonts.mono;
  if (piece.bold) return fonts.bold;
  if (piece.italic) return fonts.italic;
  return fonts.regular;
}

/**
 * Anything that could not be made to fit.
 *
 * A word wider than the space it is given does not wrap, it runs off the edge
 * of the page, and on a 300 page document nobody notices until it is printed.
 * Collected here and reported rather than silently drawn.
 */
export const overflows: Array<{ text: string; width: number; available: number }> = [];

/** Characters actually drawn, so "nothing rendered" cannot pass as success. */
export const drawn = { characters: 0 };

/** Figures the markdown asks for and the filesystem does not have. */
export const missing: string[] = [];

/** Wraps mixed-weight pieces into lines that fit a width. */
function layout(
  input: Piece[],
  fonts: Fonts,
  size: number,
  width: number,
): Piece[][] {
  const lines: Piece[][] = [];
  let line: Piece[] = [];
  let used = 0;

  for (const piece of input) {
    // Split on spaces but keep them, so a bold word followed by a plain one
    // does not lose the gap between them.
    const words = piece.text.split(/(\s+)/).filter((word) => word !== "");

    for (const word of words) {
      const font = fontFor(piece, fonts);
      const advance = font.widthOfTextAtSize(word, size);

      if (advance > width && word.trim() !== "") {
        overflows.push({ text: word, width: advance, available: width });
      }

      if (used + advance > width && line.length && word.trim() !== "") {
        lines.push(line);
        line = [];
        used = 0;
      }

      // A run of spaces at the start of a fresh line is dropped rather than
      // indenting it by accident.
      if (!line.length && word.trim() === "") continue;

      line.push({ ...piece, text: word });
      used += advance;
    }
  }

  if (line.length) lines.push(line);
  return lines;
}

async function render(
  markdown: string,
  meta: { title: string; subtitle: string; footer: string },
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(meta.title);
  pdf.setProducer("School Management System");
  pdf.setCreationDate(new Date());

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };

  const clean = (value: string) => sanitisePdfText(value, fonts.regular);

  /**
   * The mark, cut out of its background by scripts/make-logo-mark.mjs.
   *
   * Missing is not fatal. A document that refuses to build because a logo file
   * has moved is a document nobody can produce in a hurry, and the cover reads
   * perfectly well without it.
   */
  const mark = await (async () => {
    try {
      return await pdf.embedPng(
        readFileSync(path.join(root, "public/brand/mills-technologies-mark.png")),
      );
    } catch {
      return null;
    }
  })();

  /**
   * Screenshots, embedded up front.
   *
   * All of them before anything is drawn, because embedding is asynchronous
   * and drawing a block is not. Threading a promise through the block loop to
   * save reading a handful of PNGs would be the tail wagging the dog.
   */
  const figures = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  let pageNumber = 1;
  const contents: Array<{ text: string; level: 1 | 2; page: number }> = [];

  function footer(target: PDFPage, number: number) {
    // Page one is the cover and carries no number, the way a book does not.
    if (number === 1) return;
    target.drawText(clean(meta.footer), {
      x: MARGIN,
      y: MARGIN - 22,
      size: 7.5,
      font: fonts.regular,
      color: MUTED,
    });
    // The credit, centred, where a publisher's name sits on a printed page.
    const credit = clean(VENDOR);
    target.drawText(credit, {
      x: (PAGE_W - fonts.regular.widthOfTextAtSize(credit, 7.5)) / 2,
      y: MARGIN - 22,
      size: 7.5,
      font: fonts.regular,
      color: MUTED,
    });

    const label = String(number);
    target.drawText(label, {
      x: PAGE_W - MARGIN - fonts.regular.widthOfTextAtSize(label, 7.5),
      y: MARGIN - 22,
      size: 7.5,
      font: fonts.regular,
      color: MUTED,
    });
  }

  function newPage() {
    footer(page, pageNumber);
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pageNumber += 1;
    y = PAGE_H - MARGIN;
  }

  function room(needed: number) {
    if (y - needed < MARGIN + 10) newPage();
  }

  function writeLines(
    lines: Piece[][],
    size: number,
    leading: number,
    options: { x?: number; color?: ReturnType<typeof rgb>; width?: number } = {},
  ) {
    const x = options.x ?? MARGIN;
    for (const line of lines) {
      room(leading);
      let cursor = x;
      for (const piece of line) {
        const font = fontFor(piece, fonts);
        const text = clean(piece.text);
        drawn.characters += text.length;
        page.drawText(text, {
          x: cursor,
          y,
          size,
          font,
          color: options.color ?? INK,
        });
        cursor += font.widthOfTextAtSize(text, size);
      }
      y -= leading;
    }
  }

  // --- Cover -----------------------------------------------------------------
  //
  // Dark, because the mark's wordmark is white type and there is no version of
  // it that is not. Rather than treat that as a constraint to work around, the
  // whole cover takes the mark's own ground: the same indigo, the same
  // gradient, sampled from the file. The result is a cover the logo belongs on
  // instead of one it has been placed on.

  // pdf-lib has no gradient, so it is banded. Ninety strips over an A4 page is
  // a quarter of a point each, which is finer than any printer resolves.
  const BANDS = 90;
  for (let index = 0; index < BANDS; index += 1) {
    const t = index / (BANDS - 1);
    page.drawRectangle({
      x: 0,
      y: PAGE_H - ((index + 1) * PAGE_H) / BANDS,
      width: PAGE_W,
      height: PAGE_H / BANDS + 1,
      color: rgb(
        NAVY.red + (NAVY_DEEP.red - NAVY.red) * t,
        NAVY.green + (NAVY_DEEP.green - NAVY.green) * t,
        NAVY.blue + (NAVY_DEEP.blue - NAVY.blue) * t,
      ),
    });
  }

  if (mark) {
    const width = 150;
    const height = (mark.height / mark.width) * width;
    page.drawImage(mark, {
      x: MARGIN,
      y: PAGE_H - 110 - height,
      width,
      height,
    });
  }

  y = PAGE_H - 330;
  page.drawText(clean(meta.title), {
    x: MARGIN,
    y,
    size: 32,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  y -= 36;
  page.drawText(clean(meta.subtitle), {
    x: MARGIN,
    y,
    size: 16,
    font: fonts.regular,
    color: rgb(0.72, 0.71, 0.92),
  });

  y -= 28;
  page.drawRectangle({ x: MARGIN, y, width: 72, height: 3, color: VIOLET });

  y -= 42;
  page.drawText(
    clean(
      new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    ),
    { x: MARGIN, y, size: 9.5, font: fonts.regular, color: rgb(0.62, 0.61, 0.85) },
  );

  // The credit, at the foot of the cover where a publisher's name goes.
  page.drawText(clean(`Designed and built by ${VENDOR}`), {
    x: MARGIN,
    y: MARGIN + 6,
    size: 9,
    font: fonts.regular,
    color: rgb(0.62, 0.61, 0.85),
  });

  newPage();

  // --- Body ------------------------------------------------------------------
  const blocks = parseMarkdown(markdown);

  // The cover already carries the title and subtitle, so the first h1 and the
  // h2 under it would only repeat them.
  let skipped = 0;
  const body = blocks.filter((block) => {
    if (skipped < 2 && block.type === "heading" && block.level <= 2) {
      skipped += 1;
      return false;
    }
    return true;
  });

  for (const block of body) {
    if (block.type !== "image" || figures.has(block.src)) continue;
    try {
      figures.set(
        block.src,
        await pdf.embedPng(readFileSync(path.join(root, "docs", block.src))),
      );
    } catch {
      // Named and counted below rather than swallowed: a manual that silently
      // drops half its screenshots is a manual whose figure numbers stop
      // matching the text it refers to them from.
      missing.push(block.src);
    }
  }

  for (const block of body) {
    drawBlock(block);
  }

  function drawBlock(block: Block) {
    switch (block.type) {
      case "heading": {
        const size = block.level === 1 ? 17 : block.level === 2 ? 12.5 : 10.5;
        const above = block.level === 1 ? 26 : block.level === 2 ? 18 : 13;
        const below = block.level === 1 ? 12 : block.level === 2 ? 8 : 6;

        // A heading with nothing under it at the foot of a page is worse than a
        // slightly short page.
        room(above + size + below + 30);

        y -= above;

        const text = pieces(block.runs)
          .map((piece) => piece.text)
          .join("");

        if (block.level <= 2) {
          contents.push({ text, level: block.level as 1 | 2, page: pageNumber });
        }

        writeLines(
          layout([{ text, bold: true, italic: false, code: false }], fonts, size, USABLE),
          size,
          size + 4,
          { color: block.level === 1 ? ACCENT : INK },
        );

        if (block.level === 1) {
          y -= 2;
          page.drawRectangle({ x: MARGIN, y: y + 6, width: USABLE, height: 0.75, color: RULE });
        }

        y -= below;
        break;
      }

      case "paragraph": {
        writeLines(layout(pieces(block.runs), fonts, 9.8, USABLE), 9.8, 14.5);
        y -= 7;
        break;
      }

      case "quote": {
        const lines = layout(pieces(block.runs), fonts, 9.5, USABLE - 18);
        room(lines.length * 14 + 8);
        const top = y + 10;
        writeLines(lines, 9.5, 14, { x: MARGIN + 18, color: MUTED });
        page.drawRectangle({
          x: MARGIN,
          y: y + 6,
          width: 2.5,
          height: top - y - 6,
          color: ACCENT,
        });
        y -= 7;
        break;
      }

      case "list": {
        let index = 1;
        for (const item of block.items) {
          const marker = block.ordered ? `${index}.` : "•";
          const markerWidth = fonts.regular.widthOfTextAtSize(`${marker} `, 9.8);
          const lines = layout(pieces(item), fonts, 9.8, USABLE - markerWidth - 6);

          room(lines.length * 14);
          page.drawText(clean(marker), {
            x: MARGIN + 4,
            y,
            size: 9.8,
            font: fonts.regular,
            color: MUTED,
          });
          writeLines(lines, 9.8, 14, { x: MARGIN + 4 + markerWidth });
          y -= 2;
          index += 1;
        }
        y -= 6;
        break;
      }

      case "rule": {
        room(16);
        y -= 6;
        page.drawRectangle({ x: MARGIN, y, width: USABLE, height: 0.75, color: RULE });
        y -= 10;
        break;
      }

      case "image": {
        const image = figures.get(block.src);
        if (!image) break;

        const caption = block.alt
          ? layout(
              [{ text: block.alt, bold: false, italic: false, code: false }],
              fonts,
              8.5,
              USABLE,
            )
          : [];

        // Full column width, and never more than two thirds of a page tall. A
        // screenshot of a wide table set to the full height of A4 pushes
        // whatever it illustrates onto the next page, which is exactly where a
        // reader is not looking when they read the caption.
        const capHeight = caption.length * 11.5 + 21;
        const maxHeight = (PAGE_H - MARGIN * 2) * 0.66;

        /*
         * A figure shrinks into what is left of the page rather than always
         * breaking to the next one.
         *
         * Breaking unconditionally left half-empty pages all through the
         * manual: a section of prose, then a third of a page of white, then a
         * picture at the top of the next. A screenshot is legible over a wide
         * range of sizes, so giving up some of that range to keep the page
         * whole is the right trade. The floor is there because below about
         * half column width the interface in the picture stops being readable,
         * and an illegible figure is worse than a page break.
         */
        const spare = y - MARGIN - 10 - capHeight - 12;
        const wanted = Math.min(USABLE / image.width, maxHeight / image.height);
        const fitting = spare > 0 ? spare / image.height : 0;
        const floor = (USABLE * 0.55) / image.width;

        const scale = fitting >= floor && fitting < wanted ? fitting : wanted;
        const width = image.width * scale;
        const height = image.height * scale;

        // The picture and its caption move together. A caption stranded at the
        // top of the next page describes something the reader cannot see.
        room(height + capHeight);

        y -= 12;
        page.drawImage(image, { x: MARGIN, y: y - height, width, height });

        // A hairline, because a screenshot of a pale interface on a white page
        // has no edge and reads as part of the page.
        page.drawRectangle({
          x: MARGIN,
          y: y - height,
          width,
          height,
          borderColor: RULE,
          borderWidth: 0.75,
        });

        y -= height + 9;

        if (caption.length) {
          writeLines(caption, 8.5, 11.5, { color: MUTED });
        }

        y -= 8;
        break;
      }

      case "table": {
        const columns = block.header.length || 1;
        const columnWidth = USABLE / columns;

        const cellLines = (cell: Inline[], bold: boolean) =>
          layout(
            bold
              ? pieces(cell).map((piece) => ({ ...piece, bold: true }))
              : pieces(cell),
            fonts,
            8.8,
            columnWidth - 10,
          );

        const drawRow = (cells: Inline[][], bold: boolean, shade: boolean) => {
          const all = cells.map((cell) => cellLines(cell, bold));
          const height = Math.max(...all.map((lines) => lines.length), 1) * 12 + 6;

          room(height + 4);

          if (shade) {
            page.drawRectangle({
              x: MARGIN,
              y: y - height + 12,
              width: USABLE,
              height,
              color: BAND,
            });
          }

          const top = y;
          all.forEach((lines, column) => {
            y = top;
            for (const line of lines) {
              let cursor = MARGIN + column * columnWidth + 5;
              for (const piece of line) {
                const font = fontFor(piece, fonts);
                const text = clean(piece.text);
                page.drawText(text, { x: cursor, y, size: 8.8, font, color: INK });
                cursor += font.widthOfTextAtSize(text, 8.8);
              }
              y -= 12;
            }
          });

          y = top - height + 6;
          page.drawRectangle({ x: MARGIN, y: y + 8, width: USABLE, height: 0.5, color: RULE });
        };

        y -= 4;
        if (block.header.length) drawRow(block.header, true, true);
        for (const row of block.rows) drawRow(row, false, false);
        y -= 10;
        break;
      }
    }
  }

  footer(page, pageNumber);

  // --- Contents, inserted after the cover ------------------------------------
  //
  // Built last because the page numbers are only known once everything has
  // been laid out, and inserted second because that is where a reader looks
  // for it.
  if (contents.length > 3) {
    // Laid out into pages before anything is drawn.
    //
    // The contents pages themselves shift every body page along, so the number
    // printed against an entry has to include however many contents pages
    // there turn out to be. Working that out while drawing gives the entries
    // near the top a smaller offset than the ones near the bottom, and the
    // first half of the manual then points a page short. Deciding the shape
    // first and drawing second is the only way the offset is the same for
    // every entry.
    const height = (entry: (typeof contents)[number]) =>
      entry.level === 1 ? 21 : 13;

    const layoutPages: Array<typeof contents> = [];
    let current: typeof contents = [];
    let used = 44;

    for (const entry of contents) {
      if (used + height(entry) > PAGE_H - MARGIN * 2) {
        layoutPages.push(current);
        current = [];
        used = 44;
      }
      current.push(entry);
      used += height(entry);
    }
    if (current.length) layoutPages.push(current);

    const offset = layoutPages.length;

    layoutPages.forEach((entries, index) => {
      const toc = pdf.insertPage(1 + index, [PAGE_W, PAGE_H]);
      let ty = PAGE_H - MARGIN - 10;

      if (index === 0) {
        toc.drawText(clean("Contents"), {
          x: MARGIN,
          y: ty,
          size: 17,
          font: fonts.bold,
          color: ACCENT,
        });
        ty -= 12;
        toc.drawRectangle({ x: MARGIN, y: ty, width: USABLE, height: 0.75, color: RULE });
        ty -= 22;
      }

      for (const entry of entries) {
        drawEntry(toc, entry, ty, offset);
        ty -= height(entry);
      }
    });

    function drawEntry(
      toc: PDFPage,
      entry: (typeof contents)[number],
      top: number,
      pageOffset: number,
    ) {
      const size = entry.level === 1 ? 10 : 9.2;
      const font = entry.level === 1 ? fonts.bold : fonts.regular;
      const x = entry.level === 1 ? MARGIN : MARGIN + 16;
      const ty = entry.level === 1 ? top - 6 : top;

      const label = String(entry.page + pageOffset);
      const labelWidth = fonts.regular.widthOfTextAtSize(label, size);

      const text = clean(entry.text);
      toc.drawText(text, { x, y: ty, size, font, color: entry.level === 1 ? INK : MUTED });

      const textEnd = x + font.widthOfTextAtSize(text, size);
      const dotsEnd = PAGE_W - MARGIN - labelWidth - 6;
      if (dotsEnd > textEnd + 8) {
        toc.drawRectangle({
          x: textEnd + 4,
          y: ty + 2.5,
          width: dotsEnd - textEnd - 6,
          height: 0.4,
          color: RULE,
        });
      }

      toc.drawText(label, {
        x: PAGE_W - MARGIN - labelWidth,
        y: ty,
        size,
        font: fonts.regular,
        color: MUTED,
      });
    }
  }

  return Buffer.from(await pdf.save());
}

// -----------------------------------------------------------------------------

const out = process.env.SCRATCH ?? "docs";
const root = process.cwd();

const documents = [
  {
    source: "docs/user-manual.md",
    file: "School Management System - User and Trainer Manual.pdf",
    title: "School Management System",
    subtitle: "User and Trainer Manual",
    footer: "School Management System: User and Trainer Manual",
  },
  {
    source: "docs/proposal.md",
    file: "School Management System - Proposal.pdf",
    title: "School Management System",
    subtitle: "A proposal",
    footer: "School Management System: Proposal",
  },
];

async function main() {
  for (const document of documents) {
    const markdown = readFileSync(path.join(root, document.source), "utf8");

    // These documents are read by people outside the project, so the house
    // style rule is enforced rather than trusted.
    const dashes = (markdown.match(/[—–]/g) ?? []).length;
    if (dashes > 0) {
      console.error(`\n  ${document.source} contains ${dashes} em or en dash(es).`);
      process.exit(1);
    }

    overflows.length = 0;
    drawn.characters = 0;
    missing.length = 0;
    const pdf = await render(markdown, document);
    const target = path.join(out, document.file);
    writeFileSync(target, pdf);

    const reloaded = await PDFDocument.load(pdf);
    console.log(
      `  wrote ${target}
         ${reloaded.getPageCount()} pages, ${(pdf.length / 1024).toFixed(0)} KB, ${drawn.characters} characters drawn from ${markdown.length} of source`,
    );

    // A manual that quietly drops half its screenshots is a manual whose text
    // refers to figures the reader cannot see.
    if (missing.length) {
      console.error(
        `\n  ${missing.length} figure(s) named in the markdown and not on disk:`,
      );
      for (const src of missing) console.error(`    docs/${src}`);
      process.exit(1);
    }

    if (overflows.length) {
      console.error(`
  ${overflows.length} item(s) too wide for the space given:`);
      for (const item of overflows.slice(0, 10)) {
        console.error(
          `    "${item.text}" needs ${item.width.toFixed(1)}pt, has ${item.available.toFixed(1)}pt`,
        );
      }
      process.exit(1);
    }
  }
  console.log("");
}

main();
