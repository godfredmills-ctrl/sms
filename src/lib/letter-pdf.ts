import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import type { EmbeddedImage } from "@/lib/document-images";
import { sanitisePdfText } from "@/lib/pdf-text";

/**
 * The school's letterhead, and letters on it.
 *
 * Every school hands people paper the system could not produce: an offer of
 * a place, a proof that a child is enrolled, a transfer certificate when
 * they leave, a letter to a bank confirming that a member of staff is
 * employed here. All four are the same object — a formal letter on the
 * school's letterhead, with a reference, a date, an addressee, a subject,
 * body paragraphs, an optional table of particulars, and a signature block.
 *
 * So this renders that object and the routes decide what it says. A4
 * portrait, one letter per page, wrapping onto a second page when the body
 * runs long rather than shrinking the type — a letter that has been squeezed
 * to fit reads as a form, and these are letters.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const RULE = rgb(0.88, 0.9, 0.93);

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
    lines.push(current);
  }
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

export type LetterDocument = {
  /** "GCS/ADM/2026/0031" — quoted in any reply. */
  reference: string;
  /** "18 August 2026". */
  date: string;
  /** Who it is addressed to, one line per row. */
  addressee: string[];
  /** "OFFER OF ADMISSION" — printed in caps, underlined. */
  subject: string;
  /** "Dear Mr and Mrs Quartey," */
  salutation: string;
  /** Body paragraphs, in order. Blank strings are ignored. */
  paragraphs: string[];
  /** Optional boxed particulars: class offered, dates, fees. */
  particulars?: Array<{ label: string; value: string }> | null;
  /** Closing paragraphs after the particulars. */
  closingParagraphs?: string[] | null;
  /** "Yours faithfully," */
  closing: string;
  signatory: { name: string; title: string };
  /** A short line under the signature — validity, or how to verify. */
  footnote?: string | null;
};

export type LetterBatch = {
  school: {
    name: string;
    motto?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    registrationNo?: string | null;
  };
  crest?: EmbeddedImage | null;
  brandHex: string;
  letters: LetterDocument[];
};

export async function renderLettersPdf(input: LetterBatch): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setProducer("School Management System");
  pdf.setCreationDate(new Date());

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const brand = hexToRgb(input.brandHex);

  const clean = (value: string | null | undefined) =>
    value ? sanitisePdfText(value, regular) : value ?? null;

  const school = {
    name: clean(input.school.name) ?? "",
    motto: clean(input.school.motto),
    address: clean(input.school.address),
    phone: clean(input.school.phone),
    email: clean(input.school.email),
    website: clean(input.school.website),
    registrationNo: clean(input.school.registrationNo),
  };

  const crest = input.crest
    ? await (async () => {
        try {
          return input.crest!.mimeType.includes("png")
            ? await pdf.embedPng(input.crest!.bytes)
            : await pdf.embedJpg(input.crest!.bytes);
        } catch {
          return null;
        }
      })()
    : null;

  const usable = PAGE_W - MARGIN * 2;

  for (const raw of input.letters) {
    const letter: LetterDocument = {
      reference: clean(raw.reference) ?? "",
      date: clean(raw.date) ?? "",
      addressee: raw.addressee.map((line) => clean(line) ?? ""),
      subject: clean(raw.subject) ?? "",
      salutation: clean(raw.salutation) ?? "",
      paragraphs: raw.paragraphs.map((text) => clean(text) ?? "").filter(Boolean),
      particulars:
        raw.particulars?.map((entry) => ({
          label: clean(entry.label) ?? "",
          value: clean(entry.value) ?? "",
        })) ?? null,
      closingParagraphs:
        raw.closingParagraphs?.map((text) => clean(text) ?? "").filter(Boolean) ?? null,
      closing: clean(raw.closing) ?? "",
      signatory: {
        name: clean(raw.signatory.name) ?? "",
        title: clean(raw.signatory.title) ?? "",
      },
      footnote: clean(raw.footnote),
    };

    let page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    /** Starts a fresh page when the next block would run off this one. */
    const ensure = (needed: number) => {
      if (y - needed >= MARGIN + 30) return;
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    };

    // --- Letterhead ---------------------------------------------------------
    if (crest) {
      const box = 52;
      const scale = Math.min(box / crest.width, box / crest.height);
      page.drawImage(crest, {
        x: MARGIN,
        y: y - crest.height * scale,
        width: crest.width * scale,
        height: crest.height * scale,
      });
    }

    const headX = crest ? MARGIN + 62 : MARGIN;
    const headW = usable - (crest ? 62 : 0);
    let headY = y - 12;

    for (const line of wrap(school.name, bold, 16, headW).slice(0, 2)) {
      page.drawText(line, { x: headX, y: headY, size: 16, font: bold, color: INK });
      headY -= 18;
    }
    if (school.motto) {
      page.drawText(truncate(school.motto, italic, 8, headW), {
        x: headX,
        y: headY,
        size: 8,
        font: italic,
        color: brand,
      });
      headY -= 11;
    }
    const contact = [school.address, school.phone, school.email, school.website]
      .filter(Boolean)
      .join("  ·  ");
    if (contact) {
      for (const line of wrap(contact, regular, 7, headW).slice(0, 2)) {
        page.drawText(line, { x: headX, y: headY, size: 7, font: regular, color: MUTED });
        headY -= 9;
      }
    }

    y = Math.min(headY, y - 56) - 6;
    page.drawRectangle({ x: MARGIN, y, width: usable, height: 1.5, color: brand });
    y -= 4;
    page.drawRectangle({ x: MARGIN, y, width: usable, height: 0.5, color: RULE });
    y -= 24;

    // --- Reference and date -------------------------------------------------
    page.drawText(`Our ref: ${letter.reference}`, {
      x: MARGIN,
      y,
      size: 8.5,
      font: regular,
      color: MUTED,
    });
    const dateW = regular.widthOfTextAtSize(letter.date, 8.5);
    page.drawText(letter.date, {
      x: MARGIN + usable - dateW,
      y,
      size: 8.5,
      font: regular,
      color: MUTED,
    });
    y -= 26;

    // --- Addressee ----------------------------------------------------------
    for (const line of letter.addressee) {
      page.drawText(truncate(line, regular, 9.5, usable), {
        x: MARGIN,
        y,
        size: 9.5,
        font: regular,
        color: INK,
      });
      y -= 12;
    }
    y -= 14;

    // --- Subject, underlined ------------------------------------------------
    const subject = letter.subject.toUpperCase();
    const subjectLines = wrap(subject, bold, 10.5, usable);
    for (const line of subjectLines) {
      page.drawText(line, { x: MARGIN, y, size: 10.5, font: bold, color: INK });
      const width = bold.widthOfTextAtSize(line, 10.5);
      page.drawRectangle({ x: MARGIN, y: y - 3, width, height: 0.75, color: INK });
      y -= 15;
    }
    y -= 10;

    // --- Salutation and body ------------------------------------------------
    page.drawText(letter.salutation, { x: MARGIN, y, size: 10, font: regular, color: INK });
    y -= 18;

    const paragraph = (text: string) => {
      const lines = wrap(text, regular, 10, usable);
      ensure(lines.length * 14 + 10);
      for (const line of lines) {
        page.drawText(line, { x: MARGIN, y, size: 10, font: regular, color: INK });
        y -= 14;
      }
      y -= 8;
    };

    for (const text of letter.paragraphs) paragraph(text);

    // --- Particulars --------------------------------------------------------
    if (letter.particulars?.length) {
      const rowH = 16;
      const boxH = letter.particulars.length * rowH + 12;
      ensure(boxH + 12);

      page.drawRectangle({
        x: MARGIN,
        y: y - boxH,
        width: usable,
        height: boxH,
        color: rgb(0.97, 0.975, 0.98),
      });
      page.drawRectangle({
        x: MARGIN,
        y: y - boxH,
        width: 2.5,
        height: boxH,
        color: brand,
      });

      let rowY = y - 16;
      for (const entry of letter.particulars) {
        page.drawText(entry.label, {
          x: MARGIN + 14,
          y: rowY,
          size: 9,
          font: regular,
          color: MUTED,
        });
        page.drawText(truncate(entry.value, bold, 9.5, usable - 180), {
          x: MARGIN + 170,
          y: rowY,
          size: 9.5,
          font: bold,
          color: INK,
        });
        rowY -= rowH;
      }
      y -= boxH + 16;
    }

    for (const text of letter.closingParagraphs ?? []) paragraph(text);

    // --- Signature block ----------------------------------------------------
    ensure(70);
    y -= 6;
    page.drawText(letter.closing, { x: MARGIN, y, size: 10, font: regular, color: INK });
    y -= 42;

    page.drawRectangle({ x: MARGIN, y: y + 6, width: 170, height: 0.5, color: INK });
    page.drawText(letter.signatory.name, {
      x: MARGIN,
      y: y - 6,
      size: 10,
      font: bold,
      color: INK,
    });
    page.drawText(letter.signatory.title, {
      x: MARGIN,
      y: y - 18,
      size: 8.5,
      font: regular,
      color: MUTED,
    });
    y -= 34;

    if (letter.footnote) {
      for (const line of wrap(letter.footnote, regular, 7, usable)) {
        page.drawText(line, { x: MARGIN, y, size: 7, font: regular, color: MUTED });
        y -= 9;
      }
    }

    if (school.registrationNo) {
      page.drawText(`Registered: ${school.registrationNo}`, {
        x: MARGIN,
        y: MARGIN - 16,
        size: 6.5,
        font: regular,
        color: MUTED,
      });
    }
  }

  return Buffer.from(await pdf.save());
}
