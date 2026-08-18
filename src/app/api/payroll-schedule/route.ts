import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildWorkbook } from "@/lib/excel";
import { toMajor } from "@/lib/money";
import { payrollPeriodLabel } from "@/lib/payroll";

/**
 * The bank payment schedule for one payroll run.
 *
 * This is the spreadsheet a bursar walks into the bank with, or uploads to
 * a bulk-transfer portal: one row per person, the account to credit, and
 * the net amount. Cash and mobile-money recipients are included and
 * labelled rather than dropped — a schedule that silently omits the four
 * people without bank accounts is how they go unpaid.
 *
 * Amounts are written as numbers, not strings, because a bank's importer
 * reads the cell and a formatted "GH₵1,526.19" is not a number. The
 * workbook helper already escapes anything that could become a formula.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? "";

  let user;
  try {
    user = await authorize("payroll.read");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const run = await db.payrollRun.findUnique({
    where: { id: runId },
    select: {
      year: true,
      month: true,
      status: true,
      payslips: {
        orderBy: { staffName: "asc" },
        select: {
          staffName: true,
          staffNo: true,
          netMinor: true,
          paymentMethod: true,
          staff: {
            select: {
              bankName: true,
              bankBranch: true,
              bankAccountNo: true,
              momoNumber: true,
              momoNetwork: true,
            },
          },
        },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Payroll run not found." }, { status: 404 });
  }
  if (!run.payslips.length) {
    return NextResponse.json({ error: "That run has no payslips." }, { status: 404 });
  }

  const period = payrollPeriodLabel(run.year, run.month);

  const workbook = await buildWorkbook({
    sheetName: "Payment schedule",
    title: `${period} — payroll payment schedule${run.status === "DRAFT" ? " (DRAFT)" : ""}`,
    columns: [
      { key: "staffNo", header: "Staff no." },
      { key: "name", header: "Name", width: 28 },
      { key: "method", header: "Method" },
      { key: "bank", header: "Bank", width: 22 },
      { key: "branch", header: "Branch", width: 18 },
      { key: "account", header: "Account / number", width: 22 },
      { key: "amount", header: "Amount (GHS)" },
    ],
    rows: run.payslips.map((slip) => ({
      staffNo: slip.staffNo,
      name: slip.staffName,
      method:
        slip.paymentMethod === "BANK"
          ? "Bank transfer"
          : slip.paymentMethod === "MOMO"
            ? "Mobile money"
            : "Cash",
      bank:
        slip.paymentMethod === "BANK"
          ? (slip.staff.bankName ?? "")
          : slip.paymentMethod === "MOMO"
            ? (slip.staff.momoNetwork ?? "")
            : "",
      branch: slip.paymentMethod === "BANK" ? (slip.staff.bankBranch ?? "") : "",
      account:
        slip.paymentMethod === "BANK"
          ? (slip.staff.bankAccountNo ?? "")
          : slip.paymentMethod === "MOMO"
            ? (slip.staff.momoNumber ?? "")
            : "— pay in cash",
      amount: toMajor(slip.netMinor),
    })),
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "payroll.schedule.export",
      entity: "PayrollRun",
      entityId: runId,
      summary: `Exported the ${period} payment schedule (${run.payslips.length} rows)`,
    },
  });

  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="payment-schedule-${run.year}-${String(run.month).padStart(2, "0")}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
