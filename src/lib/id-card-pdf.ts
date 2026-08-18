import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";

import type { EmbeddedImage } from "@/lib/document-images";
import { sanitisePdfText } from "@/lib/pdf-text";

/**
 * Identity cards — landscape, four people to an A4 sheet.
 *
 * The design follows the school's chosen reference: a rounded card with a
 * gradient header band running from navy into the school's brand colour, a
 * circular photograph (or an initials disc) overlapping the band's lower
 * edge, the name beside it with a role pill underneath, colon-less field
 * rows with right-aligned values, and a QR code carrying the ID number.
 * The back is deliberately sparse: the school's contact details, the
 * emergency line, and the property statement.
 *
 * Each person gets one row: front on the left, back on the right, both at
 * true CR80 size (85.6 × 54 mm) inside a rounded cutting border. Printed
 * at 100% on card stock and cut, the result is a standard ID.
 */

// CR80 landscape in PDF points (1 mm = 2.8346 pt).
const CARD_W = 242.65;
const CARD_H = 153.01;
const CORNER_R = 8;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const GUTTER_X = 20;
const GUTTER_Y = 18;
const MARGIN_X = (PAGE_W - CARD_W * 2 - GUTTER_X) / 2;
const MARGIN_TOP = 56;
const ROWS_PER_PAGE = 4;

const BAND_H = 46;
const NAVY_HEX = "#181A22";

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const FAINT = rgb(0.78, 0.82, 0.87);
const WHITE = rgb(1, 1, 1);
const SOFT_WHITE = rgb(0.92, 0.93, 0.95);

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

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let value = text;
  while (font.widthOfTextAtSize(value, size) > maxWidth && value.length > 1) {
    value = value.slice(0, -1);
  }
  return value === text ? value : `${value.slice(0, -1)}…`;
}

/**
 * Circle-crops a photo with sharp: cover-fitted to a square, then masked to
 * a transparent-cornered PNG, so the renderer can simply draw it inside the
 * white ring.
 */
async function roundPhoto(image: EmbeddedImage): Promise<EmbeddedImage | null> {
  const size = 300;
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  try {
    const buffer = await sharp(image.bytes)
      .resize(size, size, { fit: "cover" })
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
    return { bytes: new Uint8Array(buffer), mimeType: "image/png" };
  } catch {
    return null;
  }
}

/**
 * The header band as a pre-rendered PNG: pdf-lib has no gradient fills, so
 * the navy-to-brand sweep with its rounded top corners is drawn by sharp
 * once per batch and stamped onto every card.
 */
async function gradientBand(brandHex: string): Promise<EmbeddedImage | null> {
  const scale = 4;
  const w = Math.round(CARD_W * scale);
  const h = Math.round(BAND_H * scale);
  const r = CORNER_R * scale;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${NAVY_HEX}"/>
    <stop offset="1" stop-color="${brandHex}"/>
  </linearGradient></defs>
  <path d="M0,${h} L0,${r} Q0,0 ${r},0 L${w - r},0 Q${w},0 ${w},${r} L${w},${h} Z" fill="url(#g)"/>
</svg>`;
  try {
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return { bytes: new Uint8Array(buffer), mimeType: "image/png" };
  } catch {
    return null;
  }
}

/** A QR code for the ID number — any phone can read the number off the card. */
async function qrFor(value: string): Promise<EmbeddedImage | null> {
  try {
    const buffer = await QRCode.toBuffer(value, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 6,
      color: { dark: "#111827ff", light: "#ffffffff" },
    });
    return { bytes: new Uint8Array(buffer), mimeType: "image/png" };
  } catch {
    return null;
  }
}

export type IdCardPerson = {
  name: string;
  /** Admission number or staff number. */
  number: string;
  /** Class for a student, job title for staff. */
  role: string;
  /** House for a student, department for staff. Optional. */
  detail?: string | null;
  photo?: EmbeddedImage | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  bloodGroup?: string | null;
};

export type IdCardBatch = {
  school: {
    name: string;
    motto?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  crest?: EmbeddedImage | null;
  /** The school's primary brand colour, hex. */
  brandHex: string;
  /** "Student Identity Card" / "Staff Identity Card". */
  title: string;
  /** The pill and the role row: "Class" for students, "Job title" for staff. */
  roleLabel: string;
  /** What `detail` means here: "House" for students, "Department" for staff. */
  detailLabel: string;
  /** The academic year, e.g. "2026/2027". Empty when none is current. */
  validity: string;
  people: IdCardPerson[];
};

type Fonts = { regular: PDFFont; bold: PDFFont };

export async function renderIdCardsPdf(input: IdCardBatch): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setProducer("School Management System");
  pdf.setCreationDate(new Date());

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = hexToRgb(input.brandHex);

  // Every string that reaches a drawText goes through the encoder check once,
  // here, so the drawing code below can measure and wrap freely.
  const clean = (value: string | null | undefined) =>
    value ? sanitisePdfText(value, regular) : value ?? null;
  const school = {
    name: clean(input.school.name) ?? "",
    motto: clean(input.school.motto),
    address: clean(input.school.address),
    phone: clean(input.school.phone),
    email: clean(input.school.email),
  };
  const title = clean(input.title) ?? "";
  const validity = clean(input.validity) ?? "";
  const roleLabel = clean(input.roleLabel) ?? "";
  const detailLabel = clean(input.detailLabel) ?? "";
  const people = input.people.map((person) => ({
    ...person,
    name: clean(person.name) ?? "",
    number: clean(person.number) ?? "",
    role: clean(person.role) ?? "",
    detail: clean(person.detail),
    emergencyName: clean(person.emergencyName),
    emergencyPhone: clean(person.emergencyPhone),
    bloodGroup: clean(person.bloodGroup),
  }));

  const bandImage = await gradientBand(input.brandHex);
  const band = bandImage ? await embed(pdf, bandImage) : null;
  const crest = input.crest ? await embed(pdf, input.crest) : null;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  footerNote(page, regular);
  let row = 0;

  for (const person of people) {
    if (row === ROWS_PER_PAGE) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      footerNote(page, regular);
      row = 0;
    }

    const top = PAGE_H - MARGIN_TOP - row * (CARD_H + GUTTER_Y);
    const rounded = person.photo ? await roundPhoto(person.photo) : null;
    const photo = rounded ? await embed(pdf, rounded) : null;
    const qrImage = await qrFor(person.number);
    const qr = qrImage ? await embed(pdf, qrImage) : null;

    drawFront(page, MARGIN_X, top, {
      person,
      photo,
      qr,
      band,
      brand,
      school,
      pill: title.toLowerCase().includes("staff") ? "STAFF" : "STUDENT",
      roleLabel,
      detailLabel,
      validity,
      fonts: { regular, bold },
    });
    drawBack(page, MARGIN_X + CARD_W + GUTTER_X, top, {
      person,
      crest,
      school,
      fonts: { regular, bold },
    });

    row += 1;
  }

  return Buffer.from(await pdf.save());
}

async function embed(pdf: PDFDocument, image: EmbeddedImage) {
  try {
    return image.mimeType.includes("png")
      ? await pdf.embedPng(image.bytes)
      : await pdf.embedJpg(image.bytes);
  } catch {
    return null;
  }
}

function footerNote(page: PDFPage, font: PDFFont) {
  const note =
    "Print at 100% scale on card stock and cut along the borders. Each card is standard CR80 size (85.6 × 54 mm).";
  page.drawText(note, {
    x: MARGIN_X,
    y: 24,
    size: 6.5,
    font,
    color: MUTED,
  });
}

/** The rounded cutting border a pair of scissors (or a die) follows. */
function cutBorder(page: PDFPage, x: number, top: number) {
  const r = CORNER_R;
  const bottom = top - CARD_H;
  const right = x + CARD_W;
  // Page coords (y up) → SVG coords anchored at (0, PAGE_H): svgY = PAGE_H - y.
  const Y = (value: number) => (PAGE_H - value).toFixed(2);
  const X = (value: number) => value.toFixed(2);
  const path = [
    `M${X(x + r)},${Y(top)}`,
    `L${X(right - r)},${Y(top)}`,
    `Q${X(right)},${Y(top)} ${X(right)},${Y(top - r)}`,
    `L${X(right)},${Y(bottom + r)}`,
    `Q${X(right)},${Y(bottom)} ${X(right - r)},${Y(bottom)}`,
    `L${X(x + r)},${Y(bottom)}`,
    `Q${X(x)},${Y(bottom)} ${X(x)},${Y(bottom + r)}`,
    `L${X(x)},${Y(top - r)}`,
    `Q${X(x)},${Y(top)} ${X(x + r)},${Y(top)}`,
    "Z",
  ].join(" ");
  page.drawSvgPath(path, { x: 0, y: PAGE_H, borderColor: FAINT, borderWidth: 0.5 });
}

/** "Thomas Acheampong" → "TA": the initials disc when there is no photo. */
function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

function drawFront(
  page: PDFPage,
  x: number,
  top: number,
  options: {
    person: IdCardPerson;
    photo: Awaited<ReturnType<typeof embed>>;
    qr: Awaited<ReturnType<typeof embed>>;
    band: Awaited<ReturnType<typeof embed>>;
    brand: ReturnType<typeof rgb>;
    school: { name: string; motto?: string | null };
    pill: string;
    roleLabel: string;
    detailLabel: string;
    validity: string;
    fonts: Fonts;
  },
) {
  const { person, photo, qr, band, brand, school, pill, roleLabel, detailLabel, validity, fonts } =
    options;

  // --- Header band ----------------------------------------------------------
  if (band) {
    page.drawImage(band, { x, y: top - BAND_H, width: CARD_W, height: BAND_H });
  } else {
    page.drawRectangle({ x, y: top - BAND_H, width: CARD_W, height: BAND_H, color: brand });
  }

  page.drawText(truncate(school.name, fonts.bold, 9.5, CARD_W - 28), {
    x: x + 14,
    y: top - 17,
    size: 9.5,
    font: fonts.bold,
    color: WHITE,
  });
  if (school.motto) {
    page.drawText(truncate(school.motto, fonts.regular, 5.5, CARD_W - 96), {
      x: x + 14,
      y: top - 28,
      size: 5.5,
      font: fonts.regular,
      color: SOFT_WHITE,
    });
  }

  // --- Avatar, overlapping the band's lower edge ----------------------------
  const r = 19;
  const cx = x + 36;
  const cy = top - BAND_H - 4;

  page.drawCircle({ x: cx, y: cy, size: r + 2.5, color: WHITE });
  if (photo) {
    page.drawImage(photo, { x: cx - r, y: cy - r, width: r * 2, height: r * 2 });
  } else {
    page.drawCircle({ x: cx, y: cy, size: r, color: brand });
    const initials = initialsOf(person.name);
    const width = fonts.bold.widthOfTextAtSize(initials, 12);
    page.drawText(initials, {
      x: cx - width / 2,
      y: cy - 4,
      size: 12,
      font: fonts.bold,
      color: WHITE,
    });
  }

  // --- Name and role pill ---------------------------------------------------
  const nameX = x + 64;
  const nameW = CARD_W - 78;
  const nameSize = fonts.bold.widthOfTextAtSize(person.name, 11) <= nameW ? 11 : 9;
  page.drawText(truncate(person.name, fonts.bold, nameSize, nameW), {
    x: nameX,
    y: top - BAND_H - 12,
    size: nameSize,
    font: fonts.bold,
    color: INK,
  });

  const pillText = pill;
  const pillSize = 5.5;
  const pillTextW = fonts.bold.widthOfTextAtSize(pillText, pillSize) + pillText.length * 0.6;
  const pillH = 10;
  const pillW = pillTextW + 14;
  const pillY = top - BAND_H - 30;
  // A pill is a rectangle with a circle at each end.
  page.drawCircle({ x: nameX + pillH / 2, y: pillY + pillH / 2, size: pillH / 2, color: brand });
  page.drawCircle({
    x: nameX + pillW - pillH / 2,
    y: pillY + pillH / 2,
    size: pillH / 2,
    color: brand,
  });
  page.drawRectangle({
    x: nameX + pillH / 2,
    y: pillY,
    width: pillW - pillH,
    height: pillH,
    color: brand,
  });
  // Letterspaced by hand — drawText has no tracking option.
  let px = nameX + 7;
  for (const char of pillText) {
    page.drawText(char, { x: px, y: pillY + 3, size: pillSize, font: fonts.bold, color: WHITE });
    px += fonts.bold.widthOfTextAtSize(char, pillSize) + 0.6;
  }

  // --- Field rows: muted label left, bold value right-aligned ---------------
  const rows: Array<[string, string]> = [[roleLabel, person.role]];
  if (person.detail) rows.push([detailLabel, person.detail]);
  rows.push(["ID No.", person.number]);
  if (validity) rows.push(["Valid", validity]);

  const labelX = x + 14;
  const valueRight = x + CARD_W - 66;
  let fy = top - BAND_H - 52;
  for (const [label, value] of rows) {
    page.drawText(label, { x: labelX, y: fy, size: 6, font: fonts.regular, color: MUTED });
    const shown = truncate(value, fonts.bold, 7, valueRight - labelX - 60);
    const width = fonts.bold.widthOfTextAtSize(shown, 7);
    page.drawText(shown, {
      x: valueRight - width,
      y: fy,
      size: 7,
      font: fonts.bold,
      color: INK,
    });
    fy -= 12;
  }

  // --- QR: the ID number, readable by any phone -----------------------------
  if (qr) {
    const size = 40;
    const qrX = x + CARD_W - size - 14;
    const qrY = top - CARD_H + 20;
    page.drawImage(qr, { x: qrX, y: qrY, width: size, height: size });
    const caption = "Scan for ID no.";
    const captionW = fonts.regular.widthOfTextAtSize(caption, 4.5);
    page.drawText(caption, {
      x: qrX + (size - captionW) / 2,
      y: qrY - 7,
      size: 4.5,
      font: fonts.regular,
      color: MUTED,
    });
  }

  cutBorder(page, x, top);
}

function drawBack(
  page: PDFPage,
  x: number,
  top: number,
  options: {
    person: IdCardPerson;
    crest: Awaited<ReturnType<typeof embed>>;
    school: {
      name: string;
      address?: string | null;
      phone?: string | null;
      email?: string | null;
    };
    fonts: Fonts;
  },
) {
  const { person, crest, school, fonts } = options;

  const inset = x + 16;
  const usable = CARD_W - 32;
  let y = top - 22;

  // The crest sits quietly at the top-right, opposite the name.
  if (crest) {
    const box = 22;
    const scale = Math.min(box / crest.width, box / crest.height);
    page.drawImage(crest, {
      x: x + CARD_W - 16 - crest.width * scale,
      y: top - 14 - crest.height * scale,
      width: crest.width * scale,
      height: crest.height * scale,
    });
  }

  page.drawText(truncate(school.name, fonts.bold, 9, usable - 28), {
    x: inset,
    y,
    size: 9,
    font: fonts.bold,
    color: INK,
  });
  y -= 13;

  for (const line of [school.phone, school.email, school.address].filter(
    (value): value is string => Boolean(value),
  )) {
    page.drawText(truncate(line, fonts.regular, 6.5, usable), {
      x: inset,
      y,
      size: 6.5,
      font: fonts.regular,
      color: MUTED,
    });
    y -= 9.5;
  }

  // --- Emergency block, when there is one -----------------------------------
  const contact = [person.emergencyName, person.emergencyPhone].filter(Boolean).join(" · ");
  if (contact || person.bloodGroup) {
    y -= 8;
    page.drawText("EMERGENCY", {
      x: inset,
      y,
      size: 5,
      font: fonts.bold,
      color: MUTED,
    });
    y -= 9;
    if (contact) {
      page.drawText(truncate(contact, fonts.bold, 6.5, usable), {
        x: inset,
        y,
        size: 6.5,
        font: fonts.bold,
        color: INK,
      });
      y -= 9.5;
    }
    if (person.bloodGroup) {
      page.drawText(`Blood group: ${person.bloodGroup}`, {
        x: inset,
        y,
        size: 6.5,
        font: fonts.regular,
        color: INK,
      });
      y -= 9.5;
    }
  }

  // --- Property statement, anchored to the card's foot ----------------------
  const statement = [
    `This card remains the property of ${school.name}.`,
    "If found, please return to the school office.",
  ];
  let sy = top - CARD_H + 14 + (statement.length - 1) * 8;
  for (const line of statement) {
    page.drawText(truncate(line, fonts.regular, 5.5, usable), {
      x: inset,
      y: sy,
      size: 5.5,
      font: fonts.regular,
      color: MUTED,
    });
    sy -= 8;
  }

  cutBorder(page, x, top);
}
