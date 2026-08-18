import "server-only";

import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";

import { db } from "@/lib/db";
import { loadDocumentImage, type EmbeddedImage } from "@/lib/document-images";
import { sanitisePdfText } from "@/lib/pdf-text";

/**
 * The school's letterhead, drawn once and shared by every document that is
 * a letter rather than a form: reports, offer letters, attestations,
 * transfer certificates.
 *
 * Two ways to get one, and a school will have opinions about which:
 *
 *  - **Upload their own.** Most schools already have artwork a printer made
 *    for them, and nothing this code draws will match it. When a letterhead
 *    image is set it is used as-is, full width, and nothing is drawn over
 *    it — the school's design is the school's design.
 *
 *  - **Draw one.** With no upload, a letterhead is composed from what the
 *    record already holds: crest, name, motto, address, phone, email,
 *    website, and a rule in the school's own colour. Deliberately quiet —
 *    the point is that a document looks like it came from a school, not
 *    that it looks designed.
 */

export type Letterhead = {
  /** Uploaded artwork, already loaded. Null means draw the default. */
  image: EmbeddedImage | null;
  school: {
    name: string;
    motto: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    registrationNo: string | null;
  };
  crest: EmbeddedImage | null;
  brandHex: string;
};

/** Everything the letterhead needs, in one query. */
export async function loadLetterhead(): Promise<Letterhead | null> {
  const school = await db.school.findFirst({
    select: {
      name: true,
      motto: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalBox: true,
      phone: true,
      email: true,
      website: true,
      registrationNo: true,
      logoUrl: true,
      crestUrl: true,
      letterheadUrl: true,
      branding: true,
    },
  });
  if (!school) return null;

  const [image, crest] = await Promise.all([
    loadDocumentImage(school.letterheadUrl),
    loadDocumentImage(school.crestUrl ?? school.logoUrl),
  ]);

  const address = [
    school.postalBox,
    school.addressLine1,
    school.addressLine2,
    school.city,
    school.region,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    image,
    crest,
    brandHex: (school.branding as { primary?: string } | null)?.primary ?? "#2C66CE",
    school: {
      name: school.name,
      motto: school.motto,
      address: address || null,
      phone: school.phone,
      email: school.email,
      website: school.website,
      registrationNo: school.registrationNo,
    },
  };
}

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
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (maxWidth <= 4) return "";
  let value = text;
  while (font.widthOfTextAtSize(value, size) > maxWidth && value.length > 1) {
    value = value.slice(0, -1);
  }
  return value === text ? value : `${value.slice(0, -1)}…`;
}

/**
 * Draws the letterhead at the top of a page and returns the y coordinate
 * where the document's own content may begin.
 */
export async function drawLetterhead(
  pdf: PDFDocument,
  page: PDFPage,
  letterhead: Letterhead,
  options: {
    pageWidth: number;
    pageHeight: number;
    margin: number;
    fonts: { regular: PDFFont; bold: PDFFont; italic?: PDFFont };
  },
): Promise<number> {
  const { pageWidth, pageHeight, margin, fonts } = options;
  const usable = pageWidth - margin * 2;
  const brand = hexToRgb(letterhead.brandHex);
  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.39, 0.45, 0.55);

  // --- The school's own artwork, used whole --------------------------------
  if (letterhead.image) {
    const embedded = await (async () => {
      try {
        return letterhead.image!.mimeType.includes("png")
          ? await pdf.embedPng(letterhead.image!.bytes)
          : await pdf.embedJpg(letterhead.image!.bytes);
      } catch {
        return null;
      }
    })();

    if (embedded) {
      // Full bleed across the text column, scaled by width, capped so a
      // tall image cannot eat the page it is heading.
      const maxHeight = pageHeight * 0.22;
      const scale = Math.min(usable / embedded.width, maxHeight / embedded.height);
      const drawWidth = embedded.width * scale;
      const drawHeight = embedded.height * scale;
      page.drawImage(embedded, {
        x: margin + (usable - drawWidth) / 2,
        y: pageHeight - margin - drawHeight,
        width: drawWidth,
        height: drawHeight,
      });
      return pageHeight - margin - drawHeight - 22;
    }
    // An unreadable upload falls through to the drawn letterhead rather than
    // leaving a document with no heading at all.
  }

  // --- The drawn letterhead ------------------------------------------------
  const clean = (value: string | null) =>
    value ? sanitisePdfText(value, fonts.regular) : null;

  let y = pageHeight - margin;
  let textX = margin;
  let textWidth = usable;

  if (letterhead.crest) {
    const embedded = await (async () => {
      try {
        return letterhead.crest!.mimeType.includes("png")
          ? await pdf.embedPng(letterhead.crest!.bytes)
          : await pdf.embedJpg(letterhead.crest!.bytes);
      } catch {
        return null;
      }
    })();
    if (embedded) {
      const box = 46;
      const scale = Math.min(box / embedded.width, box / embedded.height);
      page.drawImage(embedded, {
        x: margin,
        y: y - embedded.height * scale,
        width: embedded.width * scale,
        height: embedded.height * scale,
      });
      textX = margin + 56;
      textWidth = usable - 56;
    }
  }

  const name = clean(letterhead.school.name) ?? "";
  let textY = y - 13;
  for (const line of wrap(name, fonts.bold, 15, textWidth).slice(0, 2)) {
    page.drawText(line, { x: textX, y: textY, size: 15, font: fonts.bold, color: ink });
    textY -= 17;
  }

  const motto = clean(letterhead.school.motto);
  if (motto) {
    page.drawText(truncate(motto, fonts.italic ?? fonts.regular, 8, textWidth), {
      x: textX,
      y: textY,
      size: 8,
      font: fonts.italic ?? fonts.regular,
      color: brand,
    });
    textY -= 11;
  }

  const contact = [
    clean(letterhead.school.address),
    clean(letterhead.school.phone),
    clean(letterhead.school.email),
    clean(letterhead.school.website),
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (contact) {
    for (const line of wrap(contact, fonts.regular, 7, textWidth).slice(0, 2)) {
      page.drawText(line, { x: textX, y: textY, size: 7, font: fonts.regular, color: muted });
      textY -= 9;
    }
  }

  // The rule sits below whichever ran longer, the crest or the text.
  y = Math.min(textY, y - 50) - 6;
  page.drawRectangle({ x: margin, y, width: usable, height: 1.5, color: brand });
  y -= 4;
  page.drawRectangle({
    x: margin,
    y,
    width: usable,
    height: 0.5,
    color: rgb(0.85, 0.88, 0.91),
  });

  return y - 24;
}

/** The registration line schools are required to carry, if they have one. */
export function drawLetterheadFooter(
  page: PDFPage,
  letterhead: Letterhead,
  options: { margin: number; font: PDFFont; note?: string },
) {
  const parts = [
    options.note,
    letterhead.school.registrationNo
      ? `Registered: ${letterhead.school.registrationNo}`
      : null,
  ].filter(Boolean);
  if (!parts.length) return;

  page.drawText(sanitisePdfText(parts.join("  ·  "), options.font), {
    x: options.margin,
    y: options.margin - 16,
    size: 6.5,
    font: options.font,
    color: rgb(0.58, 0.64, 0.72),
  });
}
