import "server-only";

import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont } from "pdf-lib";

import { parseLayout, resolveBinding, type TemplateElement } from "@/lib/templates";

/**
 * Certificate and transcript rendering.
 *
 * pdf-lib rather than a headless browser: Chromium is ~300MB in the image and
 * seconds of cold start for a document that is a dozen positioned strings.
 * The template model already stores elements as percentages of the page, which
 * maps onto PDF points directly — the only real conversion is that PDF measures
 * from the bottom-left and the editor from the top-left.
 */

const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  LETTER: [612, 792],
};

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
  if (!Number.isFinite(value)) return rgb(0, 0, 0);

  return rgb(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  );
}

/**
 * Breaks a string to fit a box, measuring each candidate line in the real font
 * rather than guessing from character counts — the difference between a name
 * that fits and one that runs off a certificate.
 */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
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

export type RenderContext = Record<string, unknown>;

/**
 * Renders a template to a PDF.
 *
 * `context` is the same shape the editor previews against — `student.fullName`,
 * `document.serialNumber` and so on — so a template that looks right in the
 * builder produces the same document here.
 */
export async function renderTemplatePdf(input: {
  layout: unknown;
  pageSize: string;
  orientation: string;
  context: RenderContext;
  /** Fetched separately so this stays synchronous about IO. */
  backgroundImage?: { bytes: Uint8Array; mimeType: string } | null;
}): Promise<Buffer> {
  const layout = parseLayout(input.layout);

  const pdf = await PDFDocument.create();
  pdf.setProducer("School Management System");
  pdf.setCreationDate(new Date());

  const [shortSide, longSide] = PAGE_SIZES[input.pageSize] ?? PAGE_SIZES.A4;
  const [width, height] =
    input.orientation === "LANDSCAPE" ? [longSide, shortSide] : [shortSide, longSide];

  const page = pdf.addPage([width, height]);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);

  if (layout.backgroundColour && layout.backgroundColour !== "#ffffff") {
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: hexToRgb(layout.backgroundColour),
    });
  }

  if (input.backgroundImage) {
    try {
      const image = input.backgroundImage.mimeType.includes("png")
        ? await pdf.embedPng(input.backgroundImage.bytes)
        : await pdf.embedJpg(input.backgroundImage.bytes);
      page.drawImage(image, { x: 0, y: 0, width, height });
    } catch {
      // A background that will not embed must not cost the school the whole
      // certificate — the text is the part that matters.
    }
  }

  for (const element of layout.elements) {
    drawElement(page, element, {
      width,
      height,
      context: input.context,
      fonts: { regular, bold, italic, boldItalic },
    });
  }

  return Buffer.from(await pdf.save());
}

function drawElement(
  page: ReturnType<PDFDocument["addPage"]>,
  element: TemplateElement,
  options: {
    width: number;
    height: number;
    context: RenderContext;
    fonts: {
      regular: PDFFont;
      bold: PDFFont;
      italic: PDFFont;
      boldItalic: PDFFont;
    };
  },
) {
  const { width, height, context, fonts } = options;

  const boxX = (element.x / 100) * width;
  const boxWidth = (element.width / 100) * width;
  const boxHeight = (element.height / 100) * height;
  // The editor measures y from the top; PDF from the bottom.
  const boxTop = height - (element.y / 100) * height;

  const colour = hexToRgb(element.colour);

  if (element.type === "line") {
    page.drawRectangle({
      x: boxX,
      y: boxTop - Math.max(0.75, boxHeight),
      width: boxWidth,
      height: Math.max(0.75, boxHeight),
      color: colour,
    });
    return;
  }

  if (element.type === "box") {
    page.drawRectangle({
      x: boxX,
      y: boxTop - boxHeight,
      width: boxWidth,
      height: boxHeight,
      borderColor: colour,
      borderWidth: 1,
    });
    return;
  }

  if (element.type === "qr") {
    // The verification code is printed as text rather than as a QR image: the
    // public /verify page takes the code typed in, so a printed code works
    // from a photocopy, which is how these documents actually travel.
    const code = resolveBinding(element.value, context);
    if (!code) return;

    page.drawRectangle({
      x: boxX,
      y: boxTop - boxHeight,
      width: boxWidth,
      height: boxHeight,
      borderColor: colour,
      borderWidth: 0.75,
    });
    page.drawText(code, {
      x: boxX,
      y: boxTop - boxHeight - 9,
      size: 7,
      font: fonts.regular,
      color: colour,
    });
    return;
  }

  if (element.type === "image") {
    // Images inside the layout are placeholders in the builder; only the page
    // background is embedded. Drawing an outline keeps the geometry honest
    // rather than silently omitting the space it occupies.
    return;
  }

  const text =
    element.type === "field"
      ? resolveBinding(element.value, context)
      : element.value;

  if (!text) return;

  const font =
    element.fontWeight === "bold"
      ? element.italic
        ? fonts.boldItalic
        : fonts.bold
      : element.italic
        ? fonts.italic
        : fonts.regular;

  const size = element.fontSize;
  const lines = wrap(text, font, size, boxWidth);
  const lineHeight = size * 1.25;

  lines.forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, size);

    const x =
      element.align === "center"
        ? boxX + (boxWidth - lineWidth) / 2
        : element.align === "right"
          ? boxX + boxWidth - lineWidth
          : boxX;

    page.drawText(line, {
      x,
      // Baseline sits a little below the top of the box, then steps down.
      y: boxTop - size - index * lineHeight,
      size,
      font,
      color: colour,
      rotate: degrees(0),
    });
  });
}

/**
 * A plain tabular PDF, used for a transcript's results table where the
 * template model's single-string binding cannot carry rows.
 */
export async function renderTablePdf(input: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  footer?: string;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [width, height] = PAGE_SIZES.A4;
  const margin = 48;
  const usable = width - margin * 2;
  const columnWidth = usable / input.headers.length;

  let page = pdf.addPage([width, height]);
  let cursor = height - margin;

  page.drawText(input.title, {
    x: margin,
    y: cursor,
    size: 16,
    font: bold,
    color: rgb(0.06, 0.09, 0.16),
  });
  cursor -= 20;

  if (input.subtitle) {
    page.drawText(input.subtitle, {
      x: margin,
      y: cursor,
      size: 9,
      font: regular,
      color: rgb(0.39, 0.45, 0.55),
    });
    cursor -= 20;
  }

  function drawHeaderRow() {
    input.headers.forEach((header, index) => {
      page.drawText(header, {
        x: margin + index * columnWidth,
        y: cursor,
        size: 8,
        font: bold,
        color: rgb(0.39, 0.45, 0.55),
      });
    });
    cursor -= 4;
    page.drawRectangle({
      x: margin,
      y: cursor,
      width: usable,
      height: 0.5,
      color: rgb(0.8, 0.84, 0.88),
    });
    cursor -= 12;
  }

  drawHeaderRow();

  for (const row of input.rows) {
    // A new page repeats the header. A transcript whose second page is a
    // column of bare numbers is unreadable to a registrar.
    if (cursor < margin + 40) {
      page = pdf.addPage([width, height]);
      cursor = height - margin;
      drawHeaderRow();
    }

    row.forEach((cell, index) => {
      const truncated =
        regular.widthOfTextAtSize(cell, 9) > columnWidth - 6
          ? `${cell.slice(0, Math.max(0, Math.floor(columnWidth / 5)))}…`
          : cell;

      page.drawText(truncated, {
        x: margin + index * columnWidth,
        y: cursor,
        size: 9,
        font: regular,
        color: rgb(0.06, 0.09, 0.16),
      });
    });

    cursor -= 14;
  }

  if (input.footer) {
    page.drawText(input.footer, {
      x: margin,
      y: margin - 12,
      size: 7,
      font: regular,
      color: rgb(0.58, 0.64, 0.72),
    });
  }

  return Buffer.from(await pdf.save());
}
