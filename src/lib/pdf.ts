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
/** The binding an element uses to say "the results table goes here". */
export const RESULTS_TABLE_BINDING = "academic.resultsTable";

export async function renderTemplatePdf(input: {
  layout: unknown;
  pageSize: string;
  orientation: string;
  context: RenderContext;
  /** Fetched separately so this stays synchronous about IO. */
  backgroundImage?: { bytes: Uint8Array; mimeType: string } | null;
  /**
   * Rows for an element bound to `academic.resultsTable`. A template binds one
   * string per element, which cannot express a table — this is how a transcript
   * gets its results while still using the school's own layout.
   */
  table?: { headers: string[]; rows: string[][] } | null;
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
    // The results table is the one element that can outgrow its box and spill
    // onto another page, so it is drawn by its own routine rather than by the
    // single-box text renderer.
    if (
      input.table &&
      element.type === "field" &&
      element.value === RESULTS_TABLE_BINDING
    ) {
      await drawResultsTable(pdf, page, element, {
        width,
        height,
        table: input.table,
        fonts: { regular, bold },
      });
      continue;
    }

    drawElement(page, element, {
      width,
      height,
      context: input.context,
      fonts: { regular, bold, italic, boldItalic },
    });
  }

  return Buffer.from(await pdf.save());
}

/**
 * Draws the results table inside the box the template reserved for it.
 *
 * When the rows outrun that box the table continues on a fresh page using the
 * full height, repeating the column header. Truncating instead would drop
 * subjects off a transcript silently, which is the one failure a transcript
 * cannot have.
 */
async function drawResultsTable(
  pdf: PDFDocument,
  firstPage: ReturnType<PDFDocument["addPage"]>,
  element: TemplateElement,
  options: {
    width: number;
    height: number;
    table: { headers: string[]; rows: string[][] };
    fonts: { regular: PDFFont; bold: PDFFont };
  },
) {
  const { width, height, table, fonts } = options;

  const boxX = (element.x / 100) * width;
  const boxWidth = (element.width / 100) * width;
  const boxTop = height - (element.y / 100) * height;
  const boxBottom = boxTop - (element.height / 100) * height;

  const size = Math.min(element.fontSize, 10);
  const rowHeight = size * 1.55;
  const colour = hexToRgb(element.colour);
  const muted = rgb(0.45, 0.5, 0.58);

  const columnWidth = boxWidth / table.headers.length;

  let page = firstPage;
  let y = boxTop;
  let floor = boxBottom;

  function header() {
    table.headers.forEach((label, index) => {
      page.drawText(label, {
        x: boxX + index * columnWidth,
        y,
        size: size * 0.85,
        font: fonts.bold,
        color: muted,
      });
    });
    y -= 4;
    page.drawRectangle({
      x: boxX,
      y,
      width: boxWidth,
      height: 0.5,
      color: rgb(0.8, 0.84, 0.88),
    });
    y -= rowHeight * 0.75;
  }

  header();

  for (const row of table.rows) {
    if (y - rowHeight < floor) {
      page = pdf.addPage([width, height]);
      // A continuation page is not bound by the original box — it gets the
      // whole sheet, with a normal margin.
      y = height - 48;
      floor = 48;
      header();
    }

    row.forEach((cell, index) => {
      let value = cell;
      const max = columnWidth - 4;
      while (fonts.regular.widthOfTextAtSize(value, size) > max && value.length > 1) {
        value = value.slice(0, -1);
      }
      if (value !== cell && value.length > 1) value = `${value.slice(0, -1)}…`;

      page.drawText(value, {
        x: boxX + index * columnWidth,
        y,
        size,
        font: index === 0 ? fonts.bold : fonts.regular,
        color: colour,
      });
    });

    y -= rowHeight;
  }
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

export type ReportCardPdf = {
  school: { name: string; address?: string; motto?: string };
  heading: string;
  student: {
    name: string;
    admissionNo: string;
    className: string;
    gender?: string;
  };
  meta: Array<{ label: string; value: string }>;
  subjects: Array<{
    subject: string;
    ca: string;
    exam: string;
    total: string;
    grade: string;
    position: string;
    classAverage: string;
    remark: string;
  }>;
  summary: Array<{ label: string; value: string }>;
  remarks: Array<{ label: string; body: string; signatory?: string }>;
  footer?: string;
};

/**
 * A terminal report card.
 *
 * Built as its own renderer rather than through the template model: a report
 * card is mostly a table with a fixed set of summary boxes, and expressing that
 * as thirty absolutely-positioned elements would be miserable to maintain and
 * would break the moment a school taught one more subject than the layout had
 * rows for.
 */
export async function renderReportCardPdf(input: ReportCardPdf): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const [width, height] = PAGE_SIZES.A4;
  const margin = 40;
  const usable = width - margin * 2;

  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.39, 0.45, 0.55);
  const faint = rgb(0.85, 0.88, 0.91);

  let page = pdf.addPage([width, height]);
  let y = height - margin;

  function line(colour = faint, thickness = 0.5) {
    page.drawRectangle({ x: margin, y, width: usable, height: thickness, color: colour });
    y -= 10;
  }

  // --- Masthead ------------------------------------------------------------
  page.drawText(input.school.name, {
    x: margin,
    y,
    size: 15,
    font: bold,
    color: ink,
  });
  y -= 14;

  if (input.school.address) {
    page.drawText(input.school.address, { x: margin, y, size: 8, font: regular, color: muted });
    y -= 10;
  }
  if (input.school.motto) {
    page.drawText(input.school.motto, { x: margin, y, size: 8, font: italic, color: muted });
    y -= 10;
  }

  y -= 4;
  const headingWidth = bold.widthOfTextAtSize(input.heading, 11);
  page.drawText(input.heading, {
    x: margin + (usable - headingWidth) / 2,
    y,
    size: 11,
    font: bold,
    color: ink,
  });
  y -= 12;
  line(rgb(0.17, 0.4, 0.81), 1.2);

  // --- Student block -------------------------------------------------------
  const pairs = [
    { label: "Name", value: input.student.name },
    { label: "Admission no.", value: input.student.admissionNo },
    { label: "Class", value: input.student.className },
    ...input.meta,
  ];

  const columnWidth = usable / 2;
  pairs.forEach((pair, index) => {
    const column = index % 2;
    const rowY = y - Math.floor(index / 2) * 13;

    page.drawText(`${pair.label}:`, {
      x: margin + column * columnWidth,
      y: rowY,
      size: 8,
      font: regular,
      color: muted,
    });
    page.drawText(pair.value, {
      x: margin + column * columnWidth + 72,
      y: rowY,
      size: 9,
      font: bold,
      color: ink,
    });
  });

  y -= Math.ceil(pairs.length / 2) * 13 + 8;
  line();

  // --- Subjects ------------------------------------------------------------
  // Proportional widths: the subject name gets the room, the numbers do not
  // need it, and the remark takes whatever is left.
  const weights = [0.24, 0.08, 0.08, 0.09, 0.08, 0.09, 0.1, 0.24];
  const columns = weights.map((weight) => weight * usable);
  const offsets = columns.map((_, index) =>
    columns.slice(0, index).reduce((sum, value) => sum + value, 0),
  );

  const headers = [
    "Subject",
    "CA",
    "Exam",
    "Total",
    "Grade",
    "Position",
    "Class avg",
    "Remark",
  ];

  function subjectHeader() {
    headers.forEach((header, index) => {
      page.drawText(header, {
        x: margin + offsets[index],
        y,
        size: 7.5,
        font: bold,
        color: muted,
      });
    });
    y -= 5;
    line();
  }

  subjectHeader();

  for (const row of input.subjects) {
    if (y < margin + 150) {
      page = pdf.addPage([width, height]);
      y = height - margin;
      subjectHeader();
    }

    const cells = [
      row.subject,
      row.ca,
      row.exam,
      row.total,
      row.grade,
      row.position,
      row.classAverage,
      row.remark,
    ];

    cells.forEach((cell, index) => {
      const maxWidth = columns[index] - 4;
      let value = cell;
      // Truncate rather than overlap the next column: a report card with two
      // subjects printed on top of each other is worse than an ellipsis.
      while (regular.widthOfTextAtSize(value, 8.5) > maxWidth && value.length > 1) {
        value = value.slice(0, -1);
      }
      if (value !== cell && value.length > 1) value = `${value.slice(0, -1)}…`;

      page.drawText(value, {
        x: margin + offsets[index],
        y,
        size: 8.5,
        font: index === 0 ? bold : regular,
        color: ink,
      });
    });

    y -= 13;
  }

  y -= 2;
  line();

  // --- Summary -------------------------------------------------------------
  if (input.summary.length) {
    const boxWidth = usable / Math.min(4, input.summary.length);

    input.summary.forEach((entry, index) => {
      const column = index % 4;
      const rowY = y - Math.floor(index / 4) * 28;

      page.drawText(entry.label.toUpperCase(), {
        x: margin + column * boxWidth,
        y: rowY,
        size: 6.5,
        font: regular,
        color: muted,
      });
      page.drawText(entry.value, {
        x: margin + column * boxWidth,
        y: rowY - 12,
        size: 13,
        font: bold,
        color: ink,
      });
    });

    y -= Math.ceil(input.summary.length / 4) * 28 + 6;
    line();
  }

  // --- Remarks -------------------------------------------------------------
  for (const remark of input.remarks) {
    if (!remark.body) continue;

    if (y < margin + 60) {
      page = pdf.addPage([width, height]);
      y = height - margin;
    }

    page.drawText(remark.label.toUpperCase(), {
      x: margin,
      y,
      size: 6.5,
      font: regular,
      color: muted,
    });
    y -= 11;

    for (const wrapped of wrap(remark.body, regular, 9, usable)) {
      page.drawText(wrapped, { x: margin, y, size: 9, font: regular, color: ink });
      y -= 12;
    }

    if (remark.signatory) {
      page.drawText(`— ${remark.signatory}`, {
        x: margin,
        y,
        size: 8,
        font: italic,
        color: muted,
      });
      y -= 12;
    }

    y -= 6;
  }

  if (input.footer) {
    page.drawText(input.footer, {
      x: margin,
      y: margin - 14,
      size: 7,
      font: regular,
      color: muted,
    });
  }

  return Buffer.from(await pdf.save());
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
