import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

import type { EmbeddedImage } from "@/lib/document-images";
import { sanitisePdfText } from "@/lib/pdf-text";

/**
 * The temporary visitor pass.
 *
 * Deliberately NOT the staff and student card. A pass has one job a lanyard
 * card does not: to be recognised across a corridor as belonging to someone
 * who is not normally here, and to be recognised as stale the next morning.
 * So it is loud where the identity card is quiet — a full-width orange bar,
 * VISITOR set large, the pass number at a size you can read at a distance,
 * and the date printed twice, once in the bar and once in the expiry line.
 *
 * Two passes to an A4 sheet at CR80 landscape, cut down the dashed border.
 * The pass number, not a name, is what the register keys on: passes come
 * back to the desk and get reissued, and a number printed on the pouch
 * survives a name being misheard.
 */

// CR80 landscape in PDF points (1 mm = 2.8346 pt).
const CARD_W = 242.65;
const CARD_H = 153.01;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = (PAGE_W - CARD_W) / 2;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.42, 0.47, 0.56);
const FAINT = rgb(0.8, 0.83, 0.88);
const WHITE = rgb(1, 1, 1);

/**
 * Orange, and not the school's brand colour — that is the point. A pass in
 * house colours reads as one of ours; this one has to read as a guest at ten
 * paces, whatever the school's palette happens to be.
 */
const ALERT = rgb(0.85, 0.36, 0.05);
const ALERT_SOFT = rgb(0.99, 0.93, 0.86);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

async function qrFor(value: string): Promise<EmbeddedImage | null> {
  try {
    const buffer = await QRCode.toBuffer(value, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 0,
      width: 220,
      color: { dark: "#0F172AFF", light: "#FFFFFFFF" },
    });
    return { bytes: new Uint8Array(buffer), mimeType: "image/png" };
  } catch {
    return null;
  }
}

export type VisitorPass = {
  passNo: string;
  name: string;
  organisation?: string | null;
  /** "Parent", "Contractor" — printed as the pass's own subtitle. */
  category: string;
  /** Whom they are seeing, already resolved to a name. */
  host?: string | null;
  signedInAt: Date;
};

export type VisitorPassBatch = {
  school: {
    name: string;
    address?: string | null;
    phone?: string | null;
  };
  crest?: EmbeddedImage | null;
  passes: VisitorPass[];
};

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Accra",
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Accra",
  }).format(date);
}

type Fonts = { regular: PDFFont; bold: PDFFont };

export async function renderVisitorPassesPdf(input: VisitorPassBatch): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setProducer("School Management System");
  pdf.setCreationDate(new Date());

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // One place where every string meets the encoder, so the drawing code
  // below can measure and wrap without thinking about it.
  const clean = (value: string | null | undefined) =>
    value ? sanitisePdfText(value, regular) : "";

  const crest = await embed(pdf, input.crest ?? null);

  if (input.passes.length === 0) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    page.drawText("No visitor selected.", {
      x: MARGIN_X,
      y: PAGE_H - 90,
      size: 11,
      font: regular,
      color: MUTED,
    });
    return Buffer.from(await pdf.save());
  }

  // Two passes per sheet. The conditions sit under each pass rather than on
  // its back: the desk printer is rarely a duplex one, and terms nobody can
  // print are terms nobody reads.
  for (let index = 0; index < input.passes.length; index += 2) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const slice = input.passes.slice(index, index + 2);
    for (let row = 0; row < slice.length; row += 1) {
      const pass = slice[row];
      const top = PAGE_H - 70 - row * (CARD_H + 76);
      const qr = await embed(pdf, await qrFor(`VISITOR:${pass.passNo}`));
      drawPass(page, MARGIN_X, top, {
        pass,
        qr,
        crest,
        school: input.school,
        fonts: { regular, bold },
        clean,
      });
      drawConditions(page, MARGIN_X, top - CARD_H - 16, {
        school: input.school,
        font: regular,
        clean,
      });
      cutBorder(page, MARGIN_X, top);
    }
  }

  return Buffer.from(await pdf.save());
}

async function embed(pdf: PDFDocument, image: EmbeddedImage | null) {
  if (!image) return null;
  try {
    return image.mimeType === "image/png"
      ? await pdf.embedPng(image.bytes)
      : await pdf.embedJpg(image.bytes);
  } catch {
    return null;
  }
}

function drawPass(
  page: PDFPage,
  x: number,
  top: number,
  options: {
    pass: VisitorPass;
    qr: Awaited<ReturnType<typeof embed>>;
    crest: Awaited<ReturnType<typeof embed>>;
    school: VisitorPassBatch["school"];
    fonts: Fonts;
    clean: (value: string | null | undefined) => string;
  },
) {
  const { pass, qr, crest, school, fonts, clean } = options;
  const inner = CARD_W - 28;

  // The QR sits in its own column and the text column stops short of it.
  // Measured, not eyeballed: the school name is the one string here with no
  // upper bound on its length, and truncating it to the full inner width let
  // a long name run underneath the code.
  const QR_SIZE = 40;
  const QR_LEFT = CARD_W - 14 - QR_SIZE;
  const textWidth = QR_LEFT - 14 - 8;

  page.drawRectangle({
    x,
    y: top - CARD_H,
    width: CARD_W,
    height: CARD_H,
    color: WHITE,
    borderColor: FAINT,
    borderWidth: 0.75,
  });

  // --- The bar that makes it a visitor pass --------------------------------
  page.drawRectangle({ x, y: top - 26, width: CARD_W, height: 26, color: ALERT });
  page.drawText("VISITOR", {
    x: x + 14,
    y: top - 18,
    size: 13,
    font: fonts.bold,
    color: WHITE,
  });
  const dayText = formatDay(pass.signedInAt);
  page.drawText(dayText, {
    x: x + CARD_W - 14 - fonts.regular.widthOfTextAtSize(dayText, 7),
    y: top - 16,
    size: 7,
    font: fonts.regular,
    color: WHITE,
  });

  // --- School line ---------------------------------------------------------
  // Full width: the QR starts below this row, so nothing is beside it.
  if (crest) {
    page.drawImage(crest, { x: x + 14, y: top - 46, width: 14, height: 14 });
  }
  page.drawText(truncate(clean(school.name), fonts.bold, 7.5, inner - (crest ? 20 : 0)), {
    x: x + 14 + (crest ? 20 : 0),
    y: top - 42,
    size: 7.5,
    font: fonts.bold,
    color: INK,
  });

  if (qr) {
    page.drawImage(qr, {
      x: x + QR_LEFT,
      y: top - 120,
      width: QR_SIZE,
      height: QR_SIZE,
    });
  }

  // --- Pass number, the thing the desk keys on -----------------------------
  page.drawText("PASS NO.", {
    x: x + 14,
    y: top - 60,
    size: 5.5,
    font: fonts.bold,
    color: MUTED,
  });
  page.drawText(truncate(clean(pass.passNo), fonts.bold, 24, textWidth), {
    x: x + 14,
    y: top - 82,
    size: 24,
    font: fonts.bold,
    color: ALERT,
  });

  // --- Name and who they are ----------------------------------------------
  let cursor = top - 99;
  const nameLines = wrap(clean(pass.name), fonts.bold, 11, textWidth).slice(0, 2);
  for (const line of nameLines) {
    page.drawText(line, { x: x + 14, y: cursor, size: 11, font: fonts.bold, color: INK });
    cursor -= 11.5;
  }

  const subtitle = [clean(pass.category), clean(pass.organisation)]
    .filter(Boolean)
    .join("  -  ");
  if (subtitle) {
    page.drawText(truncate(subtitle, fonts.regular, 7, textWidth), {
      x: x + 14,
      y: cursor,
      size: 7,
      font: fonts.regular,
      color: MUTED,
    });
  }

  // --- Footer: host and the time it started counting -----------------------
  page.drawRectangle({ x, y: top - CARD_H, width: CARD_W, height: 26, color: ALERT_SOFT });
  const footerY = top - CARD_H + 14;
  const host = pass.host ? `Visiting  ${clean(pass.host)}` : "Visiting  Reception";
  page.drawText(truncate(host, fonts.regular, 7, inner - 60), {
    x: x + 14,
    y: footerY,
    size: 7,
    font: fonts.regular,
    color: INK,
  });
  const inAt = `In  ${formatTime(pass.signedInAt)}`;
  page.drawText(inAt, {
    x: x + CARD_W - 14 - fonts.bold.widthOfTextAtSize(inAt, 7),
    y: footerY,
    size: 7,
    font: fonts.bold,
    color: INK,
  });
  page.drawText("Valid today only - return to reception on leaving", {
    x: x + 14,
    y: footerY - 9,
    size: 5.5,
    font: fonts.regular,
    color: MUTED,
  });
}

/** The conditions, printed under the pass rather than on an unprintable back. */
function drawConditions(
  page: PDFPage,
  x: number,
  top: number,
  options: {
    school: VisitorPassBatch["school"];
    font: PDFFont;
    clean: (value: string | null | undefined) => string;
  },
) {
  const { school, font, clean } = options;
  const lines = [
    "This pass must be worn visibly at all times while on the premises.",
    "You remain the responsibility of the member of staff you are visiting.",
    "Do not enter classrooms, or photograph or record pupils, without permission.",
    "In an evacuation, go to the assembly point and report to the fire marshal.",
    "Return this pass to reception and sign out before you leave.",
  ];
  let cursor = top;
  for (const line of lines) {
    page.drawText(`-  ${clean(line)}`, { x, y: cursor, size: 6, font, color: MUTED });
    cursor -= 8.5;
  }
  const contact = [clean(school.address), clean(school.phone)].filter(Boolean).join("  -  ");
  if (contact) {
    page.drawText(truncate(contact, font, 6, CARD_W), {
      x,
      y: cursor - 3,
      size: 6,
      font,
      color: FAINT,
    });
  }
}

/** A dashed hairline the desk can cut along. */
function cutBorder(page: PDFPage, x: number, top: number) {
  const pad = 7;
  page.drawRectangle({
    x: x - pad,
    y: top - CARD_H - pad,
    width: CARD_W + pad * 2,
    height: CARD_H + pad * 2,
    borderColor: FAINT,
    borderWidth: 0.4,
    borderDashArray: [2, 2],
  });
}
