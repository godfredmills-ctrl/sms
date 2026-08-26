import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type { EmbeddedImage } from "@/lib/document-images";
import { sanitisePdfText } from "@/lib/pdf-text";

/**
 * Payslips as documents.
 *
 * A figure on a screen is not a payslip. The document a Ghanaian member of
 * staff actually needs — for a bank loan, a visa application, a landlord —
 * is a signed sheet naming the school, the month, the earnings, the
 * statutory deductions and the net pay, with the employer's SSNIT
 * contribution shown because SSNIT statements are checked against it.
 *
 * Two to an A4 page, so a bursar printing a whole run uses half the paper,
 * with a cut line between them. Each slip carries a plain "computer
 * generated" note rather than a signature block: the school's authority
 * here is the payroll record, and a blank signature line invites a
 * forgery that a printed statement does not.
 */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
/**
 * Tall enough for the longest realistic slip — six earnings lines and four
 * deductions — and no taller: a half-page frame around a third of a page of
 * content reads as a document that failed to finish printing.
 */
const SLIP_H = 300;
const SLIP_GAP = 32;

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const FAINT = rgb(0.85, 0.88, 0.91);
const RULE = rgb(0.92, 0.94, 0.96);
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

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (maxWidth <= 4) return "";
  let value = text;
  while (font.widthOfTextAtSize(value, size) > maxWidth && value.length > 1) {
    value = value.slice(0, -1);
  }
  return value === text ? value : `${value.slice(0, -1)}…`;
}

export type PayslipLine = { label: string; amount: string };

export type PayslipDocument = {
  period: string;
  staffName: string;
  staffNo: string;
  jobTitle?: string | null;
  department?: string | null;
  ssnitNumber?: string | null;
  paymentMethod: string;
  paymentDestination?: string | null;
  earnings: PayslipLine[];
  deductions: PayslipLine[];
  grossPay: string;
  totalDeductions: string;
  netPay: string;
  employerSsnit: string;
  paidOn?: string | null;
};

export type PayslipBatch = {
  school: {
    name: string;
    address?: string | null;
    phone?: string | null;
  };
  crest?: EmbeddedImage | null;
  brandHex: string;
  slips: PayslipDocument[];
};

export async function renderPayslipsPdf(input: PayslipBatch): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setProducer("School Management System");
  pdf.setCreationDate(new Date());

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = hexToRgb(input.brandHex);

  const clean = (value: string | null | undefined) =>
    value ? sanitisePdfText(value, regular) : value ?? null;

  const school = {
    name: clean(input.school.name) ?? "",
    address: clean(input.school.address),
    phone: clean(input.school.phone),
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

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let slot = 0;

  for (const slip of input.slips) {
    if (slot === 2) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      slot = 0;
    }

    const top = PAGE_H - MARGIN - slot * (SLIP_H + SLIP_GAP);

    // The cut line between two slips on one sheet.
    if (slot === 1) {
      const y = top + SLIP_GAP / 2;
      for (let x = MARGIN; x < PAGE_W - MARGIN; x += 8) {
        page.drawRectangle({ x, y, width: 4, height: 0.5, color: FAINT });
      }
    }

    drawSlip(page, top, {
      slip: {
        period: clean(slip.period) ?? "",
        staffName: clean(slip.staffName) ?? "",
        staffNo: clean(slip.staffNo) ?? "",
        jobTitle: clean(slip.jobTitle),
        department: clean(slip.department),
        ssnitNumber: clean(slip.ssnitNumber),
        paymentMethod: clean(slip.paymentMethod) ?? "",
        paymentDestination: clean(slip.paymentDestination),
        earnings: slip.earnings.map((line) => ({
          label: clean(line.label) ?? "",
          amount: clean(line.amount) ?? "",
        })),
        deductions: slip.deductions.map((line) => ({
          label: clean(line.label) ?? "",
          amount: clean(line.amount) ?? "",
        })),
        grossPay: clean(slip.grossPay) ?? "",
        totalDeductions: clean(slip.totalDeductions) ?? "",
        netPay: clean(slip.netPay) ?? "",
        employerSsnit: clean(slip.employerSsnit) ?? "",
        paidOn: clean(slip.paidOn),
      },
      school,
      crest,
      brand,
      fonts: { regular, bold },
    });

    slot += 1;
  }

  return Buffer.from(await pdf.save());
}

function drawSlip(
  page: PDFPage,
  top: number,
  options: {
    slip: PayslipDocument;
    school: { name: string; address?: string | null; phone?: string | null };
    crest: Awaited<ReturnType<PDFDocument["embedPng"]>> | null;
    brand: ReturnType<typeof rgb>;
    fonts: { regular: PDFFont; bold: PDFFont };
  },
) {
  const { slip, school, crest, brand, fonts } = options;
  const left = MARGIN;
  const usable = PAGE_W - MARGIN * 2;
  const right = left + usable;

  // --- Header band ---------------------------------------------------------
  const bandH = 34;
  page.drawRectangle({ x: left, y: top - bandH, width: usable, height: bandH, color: brand });

  let textX = left + 10;
  if (crest) {
    const box = 22;
    const scale = Math.min(box / crest.width, box / crest.height);
    page.drawImage(crest, {
      x: left + 10,
      y: top - bandH + (bandH - crest.height * scale) / 2,
      width: crest.width * scale,
      height: crest.height * scale,
    });
    textX = left + 10 + box + 8;
  }

  page.drawText(truncate(school.name, fonts.bold, 11, usable - 180), {
    x: textX,
    y: top - 15,
    size: 11,
    font: fonts.bold,
    color: WHITE,
  });
  const contact = [school.address, school.phone].filter(Boolean).join(" · ");
  if (contact) {
    page.drawText(truncate(contact, fonts.regular, 6, usable - 180), {
      x: textX,
      y: top - 25,
      size: 6,
      font: fonts.regular,
      color: rgb(0.9, 0.92, 0.95),
    });
  }

  const heading = "PAYSLIP";
  const headingW = fonts.bold.widthOfTextAtSize(heading, 12);
  page.drawText(heading, {
    x: right - 10 - headingW,
    y: top - 15,
    size: 12,
    font: fonts.bold,
    color: WHITE,
  });
  const periodW = fonts.regular.widthOfTextAtSize(slip.period, 7);
  page.drawText(slip.period, {
    x: right - 10 - periodW,
    y: top - 25,
    size: 7,
    font: fonts.regular,
    color: rgb(0.9, 0.92, 0.95),
  });

  // --- Identity strip -------------------------------------------------------
  let y = top - bandH - 14;
  const pairs: Array<[string, string]> = [
    ["Name", slip.staffName],
    ["Staff no.", slip.staffNo],
  ];
  if (slip.jobTitle) pairs.push(["Position", slip.jobTitle]);
  if (slip.department) pairs.push(["Department", slip.department]);
  if (slip.ssnitNumber) pairs.push(["SSNIT no.", slip.ssnitNumber]);
  pairs.push([
    "Paid by",
    slip.paymentDestination
      ? `${slip.paymentMethod} · ${slip.paymentDestination}`
      : slip.paymentMethod,
  ]);
  if (slip.paidOn) pairs.push(["Paid on", slip.paidOn]);

  const columnW = usable / 2;
  pairs.forEach((pair, index) => {
    const column = index % 2;
    const rowY = y - Math.floor(index / 2) * 12;
    page.drawText(pair[0], {
      x: left + column * columnW,
      y: rowY,
      size: 6.5,
      font: fonts.regular,
      color: MUTED,
    });
    page.drawText(truncate(pair[1], fonts.bold, 7.5, columnW - 64), {
      x: left + column * columnW + 56,
      y: rowY,
      size: 7.5,
      font: fonts.bold,
      color: INK,
    });
  });
  y -= Math.ceil(pairs.length / 2) * 12 + 8;

  page.drawRectangle({ x: left, y, width: usable, height: 0.5, color: RULE });
  y -= 12;

  // --- Earnings and deductions, side by side --------------------------------
  const gutter = 16;
  const colW = (usable - gutter) / 2;
  const rightColX = left + colW + gutter;

  function column(x: number, title: string, lines: PayslipLine[], totalLabel: string, total: string) {
    let cy = y;
    page.drawText(title.toUpperCase(), {
      x,
      y: cy,
      size: 6,
      font: fonts.bold,
      color: brand,
    });
    cy -= 10;

    for (const line of lines) {
      page.drawText(truncate(line.label, fonts.regular, 7.5, colW - 74), {
        x,
        y: cy,
        size: 7.5,
        font: fonts.regular,
        color: INK,
      });
      const width = fonts.regular.widthOfTextAtSize(line.amount, 7.5);
      page.drawText(line.amount, {
        x: x + colW - width,
        y: cy,
        size: 7.5,
        font: fonts.regular,
        color: INK,
      });
      cy -= 11;
    }

    cy -= 2;
    page.drawRectangle({ x, y: cy + 6, width: colW, height: 0.5, color: RULE });
    page.drawText(totalLabel, { x, y: cy - 4, size: 7.5, font: fonts.bold, color: INK });
    const totalW = fonts.bold.widthOfTextAtSize(total, 7.5);
    page.drawText(total, {
      x: x + colW - totalW,
      y: cy - 4,
      size: 7.5,
      font: fonts.bold,
      color: INK,
    });
    return cy - 4;
  }

  const earningsBottom = column(left, "Earnings", slip.earnings, "Gross pay", slip.grossPay);
  const deductionsBottom = column(
    rightColX,
    "Deductions",
    slip.deductions,
    "Total deductions",
    slip.totalDeductions,
  );
  y = Math.min(earningsBottom, deductionsBottom) - 16;

  // --- Net pay --------------------------------------------------------------
  const netH = 26;
  page.drawRectangle({
    x: left,
    y: y - netH,
    width: usable,
    height: netH,
    color: rgb(0.96, 0.97, 0.98),
  });
  page.drawText("NET PAY", {
    x: left + 10,
    y: y - 17,
    size: 8,
    font: fonts.bold,
    color: MUTED,
  });
  const netW = fonts.bold.widthOfTextAtSize(slip.netPay, 13);
  page.drawText(slip.netPay, {
    x: right - 10 - netW,
    y: y - 18,
    size: 13,
    font: fonts.bold,
    color: INK,
  });
  y -= netH + 10;

  // --- Employer contribution and the footnote -------------------------------
  page.drawText(
    `Employer SSNIT contribution: ${slip.employerSsnit}: paid by the school on top of the salary above.`,
    { x: left, y, size: 6, font: fonts.regular, color: MUTED },
  );
  y -= 9;
  page.drawText(
    "Computer generated from the school's payroll record; valid without a signature.",
    { x: left, y, size: 6, font: fonts.regular, color: MUTED },
  );

  // --- Frame ----------------------------------------------------------------
  page.drawRectangle({
    x: left,
    y: top - SLIP_H,
    width: usable,
    height: SLIP_H,
    borderColor: FAINT,
    borderWidth: 0.5,
  });
}
