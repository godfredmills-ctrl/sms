import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";

import type { EmbeddedImage } from "@/lib/document-images";

/**
 * Identity cards — portrait lanyard style, three people to an A4 sheet.
 *
 * The design follows the school's chosen reference: angular corner accents
 * in navy and the school's brand colour, the crest centred over the school
 * name, a circular photograph with an offset ring, the name in two colours,
 * and colon-aligned fields below. The back mirrors the corners and carries
 * the ownership statement, the emergency line, and a signature.
 *
 * Each person gets one row: front on the left, back on the right, both at
 * true CR80 size (54 × 85.6 mm portrait) inside a light cutting border.
 * Printed at 100% on card stock and cut, the result is a standard ID.
 */

// CR80 portrait in PDF points (1 mm = 2.8346 pt).
const CARD_W = 153.01;
const CARD_H = 242.65;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const GUTTER_X = 20;
const GUTTER_Y = 18;
const MARGIN_X = (PAGE_W - CARD_W * 2 - GUTTER_X) / 2;
const MARGIN_TOP = 40;
const ROWS_PER_PAGE = 3;

const INK = rgb(0.06, 0.09, 0.16);
const NAVY = rgb(0.08, 0.11, 0.18);
const MUTED = rgb(0.39, 0.45, 0.55);
const FAINT = rgb(0.78, 0.82, 0.87);
const RING_GREY = rgb(0.85, 0.87, 0.9);

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
 * Ghanaian orthography letters that standard Helvetica cannot encode, mapped
 * to their closest Latin letters. Kwabɛna prints as Kwabena rather than
 * crashing the whole batch — pdf-lib throws on the first character outside
 * WinAnsi, and one name in one class is all it would take.
 */
const TRANSLITERATE: Record<string, string> = {
  "ɛ": "e", "Ɛ": "E",
  "ɔ": "o", "Ɔ": "O",
  "ŋ": "n", "Ŋ": "N",
  "ƒ": "f", "Ƒ": "F",
  "ʋ": "v", "Ʋ": "V",
  "ɖ": "d", "Ɖ": "D",
};

function sanitise(text: string, font: PDFFont): string {
  const mapped = text.replace(/[ɛƐɔƆŋŊƒƑʋƲɖƉ]/g, (char) => TRANSLITERATE[char]);
  try {
    font.widthOfTextAtSize(mapped, 8);
    return mapped;
  } catch {
    // Anything else the font cannot take is dropped character by character —
    // a missing diacritic beats a missing card.
    return [...mapped]
      .filter((char) => {
        try {
          font.widthOfTextAtSize(char, 8);
          return true;
        } catch {
          return false;
        }
      })
      .join("");
  }
}

/**
 * Circle-crops a photo with sharp: cover-fitted to a square, then masked to
 * a transparent-cornered PNG. The renderer just draws the result — no white
 * strips, no spill, and the round frame the design calls for.
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

export type IdCardPerson = {
  name: string;
  /** Admission number or staff number. */
  number: string;
  /** Class for a student, job title for staff — the line under the name. */
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
  };
  crest?: EmbeddedImage | null;
  /** The school's primary brand colour, hex. */
  brandHex: string;
  /** "Student Identity Card" / "Staff Identity Card". */
  title: string;
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
    value ? sanitise(value, regular) : value ?? null;
  const school = {
    name: clean(input.school.name) ?? "",
    motto: clean(input.school.motto),
    address: clean(input.school.address),
    phone: clean(input.school.phone),
  };
  const title = clean(input.title) ?? "";
  const validity = clean(input.validity) ?? "";
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

    drawFront(page, MARGIN_X, top, {
      person,
      photo,
      crest,
      brand,
      school,
      title,
      detailLabel,
      validity,
      fonts: { regular, bold },
    });
    drawBack(page, MARGIN_X + CARD_W + GUTTER_X, top, {
      person,
      brand,
      school,
      title,
      validity,
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
    "Print at 100% scale on card stock and cut along the borders. Each card is standard CR80 size (54 × 85.6 mm).";
  page.drawText(note, {
    x: MARGIN_X,
    y: 20,
    size: 6.5,
    font,
    color: MUTED,
  });
}

/** The light border a pair of scissors follows. */
function cutBorder(page: PDFPage, x: number, top: number) {
  page.drawRectangle({
    x,
    y: top - CARD_H,
    width: CARD_W,
    height: CARD_H,
    borderColor: FAINT,
    borderWidth: 0.5,
  });
}

/** The lanyard punch guide: where the slot goes, not the slot itself. */
function punchGuide(page: PDFPage, x: number, top: number) {
  page.drawRectangle({
    x: x + CARD_W / 2 - 14,
    y: top - 14,
    width: 28,
    height: 5.5,
    borderColor: FAINT,
    borderWidth: 0.5,
  });
}

type CornerName = "tl" | "tr" | "bl" | "br";

/**
 * The angular corner accents from the reference design: a brand-colour layer
 * peeking out from under a navy layer, plus a detached brand sliver. Shapes
 * are authored once for the top-left corner in card-local coordinates
 * (y down from the card's top edge) and reflected into the other corners.
 */
const CORNER_SHAPES: Array<{ points: Array<[number, number]>; layer: "brand" | "navy" }> = [
  { points: [[0, 0], [62, 0], [18, 27], [0, 38]], layer: "brand" },
  { points: [[0, 0], [56, 0], [14, 25], [0, 33]], layer: "navy" },
  { points: [[44, 15], [58, 7], [62, 10], [48, 19]], layer: "brand" },
  { points: [[0, 42], [20, 30], [23, 33], [3, 46]], layer: "navy" },
];

function drawCorner(
  page: PDFPage,
  cardX: number,
  cardTop: number,
  corner: CornerName,
  brand: ReturnType<typeof rgb>,
) {
  for (const shape of CORNER_SHAPES) {
    const path = shape.points
      .map(([px, py], index) => {
        // Card-local (y down) → page coords (y up), reflected per corner.
        const pageX =
          corner === "tl" || corner === "bl" ? cardX + px : cardX + CARD_W - px;
        const pageY =
          corner === "tl" || corner === "tr"
            ? cardTop - py
            : cardTop - CARD_H + py;
        // drawSvgPath is anchored at (0, PAGE_H) below, so SVG y = PAGE_H - pageY.
        return `${index === 0 ? "M" : "L"}${pageX.toFixed(2)},${(PAGE_H - pageY).toFixed(2)}`;
      })
      .join(" ");

    page.drawSvgPath(`${path} Z`, {
      x: 0,
      y: PAGE_H,
      color: shape.layer === "navy" ? NAVY : brand,
    });
  }
}

/** Centred text, returning the next baseline. */
function centred(
  page: PDFPage,
  text: string,
  cardX: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cardX + (CARD_W - width) / 2, y, size, font, color });
}

/** Letterspaced small caps, centred — the title line under the name. */
function centredSpaced(
  page: PDFPage,
  text: string,
  cardX: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const spacing = 0.9;
  const chars = [...text.toUpperCase()];
  const width =
    chars.reduce((sum, char) => sum + font.widthOfTextAtSize(char, size), 0) +
    spacing * (chars.length - 1);
  let x = cardX + (CARD_W - width) / 2;
  for (const char of chars) {
    page.drawText(char, { x, y, size, font, color });
    x += font.widthOfTextAtSize(char, size) + spacing;
  }
}

/** Crest + school name + motto, centred — the masthead both sides share. */
function masthead(
  page: PDFPage,
  cardX: number,
  top: number,
  options: {
    crest: Awaited<ReturnType<typeof embed>>;
    school: { name: string; motto?: string | null };
    brand: ReturnType<typeof rgb>;
    fonts: Fonts;
    crestBox: number;
    nameSize: number;
    maxWidth?: number;
  },
): number {
  const { crest, school, brand, fonts, crestBox, nameSize } = options;
  const usable = options.maxWidth ?? CARD_W - 24;
  let y = top;

  if (crest) {
    const scale = Math.min(crestBox / crest.width, crestBox / crest.height);
    const w = crest.width * scale;
    const h = crest.height * scale;
    page.drawImage(crest, {
      x: cardX + (CARD_W - w) / 2,
      y: y - h,
      width: w,
      height: h,
    });
    y -= h + 9;
  }

  for (const line of wrap(school.name, fonts.bold, nameSize, usable).slice(0, 2)) {
    centred(page, line, cardX, y, fonts.bold, nameSize, INK);
    y -= nameSize + 2;
  }
  if (school.motto) {
    centred(
      page,
      truncate(school.motto, fonts.regular, 5, usable),
      cardX,
      y,
      fonts.regular,
      5,
      brand,
    );
    y -= 8;
  }
  return y;
}

function drawFront(
  page: PDFPage,
  x: number,
  top: number,
  options: {
    person: IdCardPerson;
    photo: Awaited<ReturnType<typeof embed>>;
    crest: Awaited<ReturnType<typeof embed>>;
    brand: ReturnType<typeof rgb>;
    school: { name: string; motto?: string | null };
    title: string;
    detailLabel: string;
    validity: string;
    fonts: Fonts;
  },
) {
  const { person, photo, crest, brand, school, title, detailLabel, validity, fonts } =
    options;

  drawCorner(page, x, top, "tl", brand);
  drawCorner(page, x, top, "br", brand);
  punchGuide(page, x, top);

  masthead(page, x, top - 26, {
    crest,
    school,
    brand,
    fonts,
    crestBox: 26,
    nameSize: 8.5,
  });

  // --- Photo: grey offset ring, round photograph, brand ring ---------------
  const r = 33;
  const cx = x + CARD_W / 2;
  const cy = top - 116;

  page.drawCircle({
    x: cx + 4,
    y: cy - 4,
    size: r + 3,
    borderColor: RING_GREY,
    borderWidth: 2,
  });
  if (photo) {
    page.drawImage(photo, { x: cx - r, y: cy - r, width: r * 2, height: r * 2 });
  } else {
    page.drawCircle({ x: cx, y: cy, size: r, color: rgb(0.94, 0.95, 0.97) });
    centred(page, "PHOTO", x, cy - 2, fonts.regular, 6, MUTED);
  }
  page.drawCircle({ x: cx, y: cy, size: r, borderColor: brand, borderWidth: 2.5 });

  // --- Name: first word in the brand colour, like the reference ------------
  const nameTop = cy - r - 16;
  const upper = person.name.toUpperCase();
  const usable = CARD_W - 20;
  let nameBottom = nameTop;

  if (fonts.bold.widthOfTextAtSize(upper, 10) <= usable && upper.includes(" ")) {
    const [first, ...rest] = upper.split(" ");
    const remainder = ` ${rest.join(" ")}`;
    const total =
      fonts.bold.widthOfTextAtSize(first, 10) +
      fonts.bold.widthOfTextAtSize(remainder, 10);
    const startX = x + (CARD_W - total) / 2;
    page.drawText(first, { x: startX, y: nameTop, size: 10, font: fonts.bold, color: brand });
    page.drawText(remainder, {
      x: startX + fonts.bold.widthOfTextAtSize(first, 10),
      y: nameTop,
      size: 10,
      font: fonts.bold,
      color: INK,
    });
  } else {
    // Long names wrap onto two centred lines in ink alone, and everything
    // below moves down with the extra line rather than colliding with it.
    let y = nameTop;
    for (const line of wrap(upper, fonts.bold, 8.5, usable).slice(0, 2)) {
      centred(page, line, x, y, fonts.bold, 8.5, INK);
      nameBottom = y;
      y -= 10;
    }
  }

  const roleY = nameBottom - 12;
  centredSpaced(
    page,
    truncate(person.role, fonts.regular, 5.5, usable),
    x,
    roleY,
    fonts.regular,
    5.5,
    MUTED,
  );
  centredSpaced(page, title, x, roleY - 10, fonts.regular, 4.5, brand);

  // --- Colon-aligned fields -------------------------------------------------
  const rows: Array<[string, string]> = [["ID No", person.number]];
  if (person.detail) rows.push([detailLabel, person.detail]);
  if (validity) rows.push(["Valid", validity]);

  const fieldX = x + 22;
  const colonX = x + 62;
  let fy = roleY - 26;
  for (const [label, value] of rows) {
    page.drawText(label, { x: fieldX, y: fy, size: 6, font: fonts.regular, color: MUTED });
    page.drawText(":", { x: colonX, y: fy, size: 6, font: fonts.regular, color: MUTED });
    page.drawText(truncate(value, fonts.bold, 6.5, CARD_W - 90), {
      x: colonX + 6,
      y: fy,
      size: 6.5,
      font: fonts.bold,
      color: INK,
    });
    fy -= 10.5;
  }

  cutBorder(page, x, top);
}

function drawBack(
  page: PDFPage,
  x: number,
  top: number,
  options: {
    person: IdCardPerson;
    brand: ReturnType<typeof rgb>;
    school: { name: string; motto?: string | null; address?: string | null; phone?: string | null };
    title: string;
    validity: string;
    fonts: Fonts;
  },
) {
  const { person, brand, school, title, validity, fonts } = options;

  // Mirrored corners, as the reference's back shows.
  drawCorner(page, x, top, "tr", brand);
  drawCorner(page, x, top, "bl", brand);
  punchGuide(page, x, top);

  let y = masthead(page, x, top - 34, {
    crest: null,
    school,
    brand,
    fonts,
    crestBox: 0,
    nameSize: 7.5,
    maxWidth: CARD_W - 48,
  });
  y -= 10;

  const inset = x + 18;
  const usable = CARD_W - 36;

  function bullet(text: string, emphasis = false) {
    page.drawRectangle({ x: inset, y: y + 1.5, width: 3, height: 3, color: brand });
    for (const line of wrap(text, emphasis ? fonts.bold : fonts.regular, 6, usable - 8)) {
      page.drawText(line, {
        x: inset + 7,
        y,
        size: 6,
        font: emphasis ? fonts.bold : fonts.regular,
        color: INK,
      });
      y -= 8;
    }
    y -= 4;
  }

  const holder = title.toLowerCase().includes("staff") ? "staff member" : "student";
  bullet(`This card identifies a registered ${holder} of ${school.name}.`);
  bullet("It remains the property of the school and must be produced on request.");

  const contact = [person.emergencyName, person.emergencyPhone].filter(Boolean).join(" · ");
  if (contact) bullet(`Emergency: ${contact}`, true);
  if (person.bloodGroup) bullet(`Blood group: ${person.bloodGroup}`, true);

  y -= 2;
  const rows: Array<[string, string]> = [];
  if (validity) rows.push(["Valid", `${validity} academic year`]);
  const returnTo = [school.address, school.phone].filter(Boolean).join(" · ");
  if (returnTo) rows.push(["Return to", returnTo]);

  const colonX = inset + 34;
  for (const [label, value] of rows) {
    page.drawText(label, { x: inset, y, size: 5.5, font: fonts.regular, color: MUTED });
    page.drawText(":", { x: colonX, y, size: 5.5, font: fonts.regular, color: MUTED });
    const lines = wrap(value, fonts.regular, 6, CARD_W - (colonX - x) - 24);
    for (const line of lines) {
      page.drawText(line, { x: colonX + 5, y, size: 6, font: fonts.regular, color: INK });
      y -= 8;
    }
    y -= 2.5;
  }

  // --- Signature ------------------------------------------------------------
  const lineW = 62;
  const lineX = x + CARD_W - 20 - lineW;
  const lineY = top - CARD_H + 30;
  page.drawRectangle({ x: lineX, y: lineY, width: lineW, height: 0.5, color: INK });
  const label = "Signature";
  const labelW = fonts.regular.widthOfTextAtSize(label, 5.5);
  page.drawText(label, {
    x: lineX + (lineW - labelW) / 2,
    y: lineY - 8,
    size: 5.5,
    font: fonts.regular,
    color: MUTED,
  });

  cutBorder(page, x, top);
}
