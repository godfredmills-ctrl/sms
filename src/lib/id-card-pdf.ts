import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type { EmbeddedImage } from "@/lib/document-images";

/**
 * Identity cards, four to an A4 sheet.
 *
 * Each person gets one row: the card front on the left, the back on the
 * right, both at true CR80 size (85.6 × 54 mm) inside a light cutting
 * border. Printed at 100% on card stock and cut out, the result is a
 * standard-sized ID; sent to a print shop, the marks say exactly where the
 * blade goes. One renderer serves students and staff — the difference is a
 * title and which lines fill the fields.
 */

// CR80 in PDF points (1 mm = 2.8346 pt).
const CARD_W = 242.65;
const CARD_H = 153.01;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const GUTTER_X = 20;
const GUTTER_Y = 18;
const MARGIN_X = (PAGE_W - CARD_W * 2 - GUTTER_X) / 2;
const MARGIN_TOP = 56;
const ROWS_PER_PAGE = 4;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const FAINT = rgb(0.78, 0.82, 0.87);
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
    address?: string | null;
    phone?: string | null;
  };
  crest?: EmbeddedImage | null;
  /** The school's primary brand colour, hex. */
  brandHex: string;
  /** "STUDENT IDENTITY CARD" / "STAFF IDENTITY CARD". */
  title: string;
  /** What `role` means here: "Class" for students, "Job title" for staff. */
  roleLabel: string;
  /** What `detail` means here: "House" for students, "Department" for staff. */
  detailLabel: string;
  /** e.g. "Valid: 2026/2027 academic year". */
  validity: string;
  people: IdCardPerson[];
};

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
    address: clean(input.school.address),
    phone: clean(input.school.phone),
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
    const photo = person.photo ? await embed(pdf, person.photo) : null;

    drawFront(page, MARGIN_X, top, {
      person,
      photo,
      crest,
      brand,
      school,
      title,
      roleLabel,
      detailLabel,
      validity,
      fonts: { regular, bold },
    });
    drawBack(page, MARGIN_X + CARD_W + GUTTER_X, top, {
      person,
      brand,
      school,
      title,
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
    y: 30,
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

function drawFront(
  page: PDFPage,
  x: number,
  top: number,
  options: {
    person: IdCardPerson;
    photo: Awaited<ReturnType<typeof embed>>;
    crest: Awaited<ReturnType<typeof embed>>;
    brand: ReturnType<typeof rgb>;
    school: IdCardBatch["school"];
    title: string;
    roleLabel: string;
    detailLabel: string;
    validity: string;
    fonts: { regular: PDFFont; bold: PDFFont };
  },
) {
  const { person, photo, crest, brand, school, title, roleLabel, detailLabel, validity, fonts } =
    options;

  // --- Photo (drawn FIRST) -------------------------------------------------
  // The photo is covered-and-masked: scaled to fill its frame and the
  // overflow painted back out with white strips. Those strips can reach
  // beyond the frame — above it for a tall photo, beside it for a wide one —
  // so everything that must survive them (the brand band, the cut border) is
  // drawn AFTER the photo, painting over any spill instead of under it.
  const bandH = 40;
  const photoX = x + 10;
  const photoW = 60;
  const photoH = 74;
  const photoTop = top - bandH - 10;

  if (photo) {
    const scale = Math.max(photoW / photo.width, photoH / photo.height);
    const drawW = photo.width * scale;
    const drawH = photo.height * scale;
    page.drawImage(photo, {
      x: photoX + (photoW - drawW) / 2,
      y: photoTop - photoH + (photoH - drawH) / 2,
      width: drawW,
      height: drawH,
    });
    if (drawW > photoW) {
      const over = (drawW - photoW) / 2;
      page.drawRectangle({ x: photoX - over, y: photoTop - photoH, width: over, height: photoH, color: WHITE });
      page.drawRectangle({ x: photoX + photoW, y: photoTop - photoH, width: over, height: photoH, color: WHITE });
    }
    if (drawH > photoH) {
      const over = (drawH - photoH) / 2;
      page.drawRectangle({ x: photoX, y: photoTop, width: photoW, height: over, color: WHITE });
      page.drawRectangle({ x: photoX, y: photoTop - photoH - over, width: photoW, height: over, color: WHITE });
    }
  }

  // The frame, over the masked edges; the placeholder when there is nothing
  // to frame.
  page.drawRectangle({
    x: photoX,
    y: photoTop - photoH,
    width: photoW,
    height: photoH,
    borderColor: FAINT,
    borderWidth: 0.5,
  });
  if (!photo) {
    const label = "PHOTO";
    const labelW = fonts.regular.widthOfTextAtSize(label, 6);
    page.drawText(label, {
      x: photoX + (photoW - labelW) / 2,
      y: photoTop - photoH / 2 - 3,
      size: 6,
      font: fonts.regular,
      color: MUTED,
    });
  }

  // --- Header band ---------------------------------------------------------
  page.drawRectangle({ x, y: top - bandH, width: CARD_W, height: bandH, color: brand });

  if (crest) {
    const box = 26;
    const scale = Math.min(box / crest.width, box / crest.height);
    page.drawImage(crest, {
      x: x + 8,
      y: top - bandH + (bandH - crest.height * scale) / 2,
      width: crest.width * scale,
      height: crest.height * scale,
    });
  }

  const textX = x + (crest ? 40 : 10);
  const textW = CARD_W - (crest ? 48 : 18);
  const nameLines = wrap(school.name, fonts.bold, 8.5, textW).slice(0, 2);
  let bandY = top - 13;
  for (const line of nameLines) {
    page.drawText(line, { x: textX, y: bandY, size: 8.5, font: fonts.bold, color: WHITE });
    bandY -= 10;
  }
  page.drawText(title.toUpperCase(), {
    x: textX,
    y: top - bandH + 7,
    size: 5.5,
    font: fonts.regular,
    color: WHITE,
  });

  // --- Fields --------------------------------------------------------------
  const fieldX = x + 80;
  const fieldW = CARD_W - 90;
  let y = top - bandH - 16;

  function field(label: string, value: string, lines = 1) {
    page.drawText(label.toUpperCase(), {
      x: fieldX,
      y,
      size: 4.5,
      font: fonts.regular,
      color: MUTED,
    });
    y -= 8;
    const wrapped = wrap(value, fonts.bold, 8, fieldW).slice(0, lines);
    for (const line of wrapped) {
      page.drawText(line, { x: fieldX, y, size: 8, font: fonts.bold, color: INK });
      y -= 9.5;
    }
    y -= 3.5;
  }

  field("Name", person.name, 2);
  field("Number", person.number);
  field(roleLabel, person.role);
  if (person.detail) field(detailLabel, person.detail);

  // Validity sits above the footer band whatever the field column did.
  page.drawText(validity, {
    x: x + 10,
    y: top - CARD_H + 12,
    size: 6,
    font: fonts.regular,
    color: MUTED,
  });

  // --- Footer band ---------------------------------------------------------
  page.drawRectangle({ x, y: top - CARD_H, width: CARD_W, height: 6, color: brand });

  // Last, over anything a photo mask spilled onto.
  cutBorder(page, x, top);
}

function drawBack(
  page: PDFPage,
  x: number,
  top: number,
  options: {
    person: IdCardPerson;
    brand: ReturnType<typeof rgb>;
    school: IdCardBatch["school"];
    title: string;
    fonts: { regular: PDFFont; bold: PDFFont };
  },
) {
  const { person, brand, school, title, fonts } = options;

  cutBorder(page, x, top);
  page.drawRectangle({ x, y: top - 10, width: CARD_W, height: 10, color: brand });

  const inset = x + 12;
  const usable = CARD_W - 24;
  let y = top - 24;

  const holder = title.toLowerCase().includes("staff") ? "staff member" : "student";
  const statement = `This card identifies a registered ${holder} of ${school.name}. It remains the property of the school and must be produced on request.`;
  for (const line of wrap(statement, fonts.regular, 6, usable)) {
    page.drawText(line, { x: inset, y, size: 6, font: fonts.regular, color: INK });
    y -= 8;
  }
  y -= 6;

  if (person.emergencyName || person.emergencyPhone || person.bloodGroup) {
    page.drawText("EMERGENCY", {
      x: inset,
      y,
      size: 4.5,
      font: fonts.regular,
      color: MUTED,
    });
    y -= 8;
    const contact = [person.emergencyName, person.emergencyPhone]
      .filter(Boolean)
      .join(" · ");
    if (contact) {
      page.drawText(truncate(contact, fonts.bold, 7, usable), {
        x: inset,
        y,
        size: 7,
        font: fonts.bold,
        color: INK,
      });
      y -= 9;
    }
    if (person.bloodGroup) {
      page.drawText(`Blood group: ${person.bloodGroup}`, {
        x: inset,
        y,
        size: 6.5,
        font: fonts.regular,
        color: INK,
      });
      y -= 9;
    }
    y -= 5;
  }

  page.drawText("IF FOUND, PLEASE RETURN TO", {
    x: inset,
    y,
    size: 4.5,
    font: fonts.regular,
    color: MUTED,
  });
  y -= 8;
  const returnTo = [school.name, school.address, school.phone]
    .filter(Boolean)
    .join(" · ");
  for (const line of wrap(returnTo, fonts.regular, 6.5, usable).slice(0, 3)) {
    page.drawText(line, { x: inset, y, size: 6.5, font: fonts.regular, color: INK });
    y -= 8;
  }

  // --- Signature -----------------------------------------------------------
  const lineW = 76;
  const lineX = x + CARD_W - 12 - lineW;
  const lineY = top - CARD_H + 24;
  page.drawRectangle({ x: lineX, y: lineY, width: lineW, height: 0.5, color: INK });
  const label = "Head Teacher";
  const labelW = fonts.regular.widthOfTextAtSize(label, 5.5);
  page.drawText(label, {
    x: lineX + (lineW - labelW) / 2,
    y: lineY - 8,
    size: 5.5,
    font: fonts.regular,
    color: MUTED,
  });

  page.drawRectangle({ x, y: top - CARD_H, width: CARD_W, height: 6, color: brand });
}
