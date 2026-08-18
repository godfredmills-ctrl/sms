import { NextResponse } from "next/server";

import { requireUser, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadDocumentImage } from "@/lib/document-images";
import { formatMoney } from "@/lib/money";
import { parseAllowances, payrollPeriodLabel } from "@/lib/payroll";
import { renderPayslipsPdf, type PayslipDocument } from "@/lib/payslip-pdf";
import { formatDate } from "@/lib/utils";

/**
 * Payslips as a PDF.
 *
 *   ?id=<payslipId>   one slip
 *   ?runId=<runId>    every slip in a run, two to a sheet
 *
 * Access is decided per slip, not per route: a member of staff may always
 * take their own paid payslip, and only a payroll.read holder may take
 * anyone else's or a whole run. A draft run is the bursar's working —
 * nobody but payroll staff sees those figures, because a number that
 * changes before payday should never have left the office.
 */
export const dynamic = "force-dynamic";

function message(status: number, title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#111">
<h1 style="font-size:1.1rem">${title}</h1><p style="color:#555;line-height:1.5">${body}</p>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

const SLIP_SELECT = {
  id: true,
  staffId: true,
  staffName: true,
  staffNo: true,
  basicMinor: true,
  allowances: true,
  grossMinor: true,
  ssnitEmployeeMinor: true,
  ssnitEmployerMinor: true,
  payeMinor: true,
  otherDeductions: true,
  netMinor: true,
  paymentMethod: true,
  staff: {
    select: {
      jobTitle: true,
      department: true,
      ssnitNumber: true,
      bankName: true,
      bankAccountNo: true,
      momoNumber: true,
    },
  },
  run: { select: { id: true, year: true, month: true, status: true, paidAt: true } },
} as const;

type SlipRow = {
  id: string;
  staffId: string;
  staffName: string;
  staffNo: string;
  basicMinor: number;
  allowances: unknown;
  grossMinor: number;
  ssnitEmployeeMinor: number;
  ssnitEmployerMinor: number;
  payeMinor: number;
  otherDeductions: unknown;
  netMinor: number;
  paymentMethod: string | null;
  staff: {
    jobTitle: string | null;
    department: string | null;
    ssnitNumber: string | null;
    bankName: string | null;
    bankAccountNo: string | null;
    momoNumber: string | null;
  };
  run: { id: string; year: number; month: number; status: string; paidAt: Date | null };
};

/** One stored payslip as the document's lines. Figures come off the row. */
function toDocument(slip: SlipRow): PayslipDocument {
  const allowances = parseAllowances(slip.allowances);
  const otherDeductions = parseAllowances(slip.otherDeductions);
  const totalDeductions =
    slip.ssnitEmployeeMinor +
    slip.payeMinor +
    otherDeductions.reduce((sum, entry) => sum + entry.amountMinor, 0);

  const destination =
    slip.paymentMethod === "BANK"
      ? [slip.staff.bankName, slip.staff.bankAccountNo].filter(Boolean).join(" ") || null
      : slip.paymentMethod === "MOMO"
        ? slip.staff.momoNumber
        : null;

  return {
    period: payrollPeriodLabel(slip.run.year, slip.run.month),
    staffName: slip.staffName,
    staffNo: slip.staffNo,
    jobTitle: slip.staff.jobTitle,
    department: slip.staff.department,
    ssnitNumber: slip.staff.ssnitNumber,
    paymentMethod:
      slip.paymentMethod === "BANK"
        ? "Bank transfer"
        : slip.paymentMethod === "MOMO"
          ? "Mobile money"
          : "Cash",
    paymentDestination: destination,
    earnings: [
      { label: "Basic salary", amount: formatMoney(slip.basicMinor, "GHS") },
      ...allowances.map((entry) => ({
        label: entry.name,
        amount: formatMoney(entry.amountMinor, "GHS"),
      })),
    ],
    deductions: [
      { label: "SSNIT (5.5%)", amount: formatMoney(slip.ssnitEmployeeMinor, "GHS") },
      { label: "PAYE", amount: formatMoney(slip.payeMinor, "GHS") },
      ...otherDeductions.map((entry) => ({
        label: entry.name,
        amount: formatMoney(entry.amountMinor, "GHS"),
      })),
    ],
    grossPay: formatMoney(slip.grossMinor, "GHS"),
    totalDeductions: formatMoney(totalDeductions, "GHS"),
    netPay: formatMoney(slip.netMinor, "GHS"),
    employerSsnit: formatMoney(slip.ssnitEmployerMinor, "GHS"),
    paidOn: slip.run.paidAt ? formatDate(slip.run.paidAt, "long") : null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const runId = url.searchParams.get("runId");

  const user = await requireUser();
  const canReadPayroll = userCan(user, "payroll.read");

  let slips: SlipRow[];
  let filename: string;

  if (runId) {
    if (!canReadPayroll) {
      return message(403, "Not allowed", "Only payroll staff can print a whole run.");
    }
    slips = (await db.payslip.findMany({
      where: { runId },
      orderBy: { staffName: "asc" },
      select: SLIP_SELECT,
    })) as SlipRow[];
    if (!slips.length) return message(404, "Nothing to print", "That run has no payslips.");
    filename = `payslips-${slips[0].run.year}-${String(slips[0].run.month).padStart(2, "0")}`;
  } else if (id) {
    const slip = (await db.payslip.findUnique({
      where: { id },
      select: SLIP_SELECT,
    })) as SlipRow | null;
    if (!slip) return message(404, "Payslip not found", "That payslip does not exist.");

    // Own payslip, or payroll staff. A member of staff only gets their own
    // once the run is paid — before that the figure can still change.
    const isOwn = Boolean(user.staffId) && slip.staffId === user.staffId;
    if (!canReadPayroll) {
      if (!isOwn) {
        return message(403, "Not your payslip", "You can only open your own payslips.");
      }
      if (slip.run.status !== "PAID") {
        return message(
          404,
          "Not yet issued",
          "This payslip becomes available once the month's payroll has been paid.",
        );
      }
    }

    slips = [slip];
    filename = `payslip-${slip.staffNo.replace(/[^A-Za-z0-9._-]+/g, "-")}-${slip.run.year}-${String(slip.run.month).padStart(2, "0")}`;
  } else {
    return message(400, "Nothing chosen", "Choose a payslip or a payroll run.");
  }

  const school = await db.school.findFirst({
    select: {
      name: true,
      addressLine1: true,
      city: true,
      phone: true,
      logoUrl: true,
      crestUrl: true,
      branding: true,
    },
  });
  if (!school) {
    return message(400, "No school profile", "Set up the school profile under Settings first.");
  }

  const crest = await loadDocumentImage(school.crestUrl ?? school.logoUrl);
  const brandHex = (school.branding as { primary?: string } | null)?.primary ?? "#2C66CE";

  const pdf = await renderPayslipsPdf({
    school: {
      name: school.name,
      address: [school.addressLine1, school.city].filter(Boolean).join(", "),
      phone: school.phone,
    },
    crest,
    brandHex,
    slips: slips.map(toDocument),
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "payroll.payslip.print",
      entity: "Payslip",
      entityId: id ?? runId ?? undefined,
      summary: `Printed ${slips.length} payslip(s) for ${payrollPeriodLabel(slips[0].run.year, slips[0].run.month)}`,
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
