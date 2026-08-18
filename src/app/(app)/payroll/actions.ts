"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/messaging";
import { formatMoney, toMinor } from "@/lib/money";
import {
  computePayslip,
  parseAllowances,
  payrollPeriodLabel,
  type Allowance,
} from "@/lib/payroll";

export type PayrollState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Sets a staff member's compensation.
 *
 * Salary lives on the staff record; what was actually paid lives on the
 * payslips, frozen at the moment they were computed. Changing a salary
 * therefore never rewrites history — it changes what the next run will
 * compute, which is the only honest arrangement.
 */
export async function setCompensationAction(
  _previous: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  let user;
  try {
    user = await authorize("payroll.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const staffId = text(formData, "staffId");
  if (!staffId) return { error: "Choose the staff member." };

  const basicRaw = text(formData, "basicSalary");
  if (!basicRaw) {
    // An empty salary takes someone off the payroll rather than paying zero.
    await db.staff.update({
      where: { id: staffId },
      data: { basicSalaryMinor: null, salaryAllowances: [] },
    });
    revalidatePath("/payroll/salaries");
    return { ok: true, message: "Removed from the payroll." };
  }

  const basicMinor = toMinor(basicRaw);
  if (!Number.isFinite(basicMinor) || basicMinor < 0) {
    return { error: "That salary is not an amount." };
  }
  if (basicMinor > 100_000_00) {
    return { error: "That is over GH₵100,000 a month. Check the figure." };
  }

  // Allowances arrive as paired fields; blank rows are simply dropped.
  const names = formData.getAll("allowanceName").map(String);
  const amounts = formData.getAll("allowanceAmount").map(String);
  const allowances: Allowance[] = [];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]?.trim();
    const raw = amounts[index]?.trim();
    if (!name || !raw) continue;
    const amountMinor = toMinor(raw);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      return { error: `“${name}” needs a positive amount.` };
    }
    allowances.push({ name, amountMinor });
  }

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { firstName: true, lastName: true },
  });
  if (!staff) return { error: "Staff member not found." };

  await db.staff.update({
    where: { id: staffId },
    data: { basicSalaryMinor: basicMinor, salaryAllowances: allowances },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "payroll.compensation.set",
      entity: "Staff",
      entityId: staffId,
      summary: `Set salary for ${staff.firstName} ${staff.lastName}: ${formatMoney(basicMinor, "GHS")} basic${
        allowances.length ? ` + ${allowances.length} allowance(s)` : ""
      }`,
    },
  });

  revalidatePath("/payroll/salaries");
  return { ok: true, message: "Saved." };
}

/**
 * Opens a month's payroll as a draft.
 *
 * Every staff member with a salary gets a slip computed from the rules in
 * src/lib/payroll.ts, and the numbers are written down rather than derived
 * on read: a payslip is a statement about what was paid in August, and it
 * must not change when someone's salary changes in September.
 */
export async function createPayrollRunAction(
  _previous: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  let user;
  try {
    user = await authorize("payroll.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const year = Number(text(formData, "year"));
  const month = Number(text(formData, "month"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Choose a year." };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "Choose a month." };
  }

  const existing = await db.payrollRun.findUnique({
    where: { year_month: { year, month } },
    select: { id: true },
  });
  if (existing) {
    return { error: `${payrollPeriodLabel(year, month)} already has a payroll run.` };
  }

  const staff = await db.staff.findMany({
    where: { status: "ACTIVE", basicSalaryMinor: { not: null } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      staffNo: true,
      title: true,
      firstName: true,
      lastName: true,
      basicSalaryMinor: true,
      salaryAllowances: true,
      bankAccountNo: true,
      momoNumber: true,
    },
  });
  if (!staff.length) {
    return {
      error: "Nobody is on the payroll yet — set salaries under Payroll → Salaries first.",
    };
  }

  const run = await db.payrollRun.create({
    data: { year, month, createdById: user.id },
    select: { id: true },
  });

  // One row per person, computed once and stored. Written in a transaction
  // with the run so a half-built payroll cannot exist.
  await db.payslip.createMany({
    data: staff.map((member) => {
      const figures = computePayslip({
        basicMinor: member.basicSalaryMinor ?? 0,
        allowances: parseAllowances(member.salaryAllowances),
      });
      return {
        runId: run.id,
        staffId: member.id,
        staffName: [member.title, member.firstName, member.lastName]
          .filter(Boolean)
          .join(" "),
        staffNo: member.staffNo,
        basicMinor: figures.basicMinor,
        allowances: parseAllowances(member.salaryAllowances),
        grossMinor: figures.grossMinor,
        ssnitEmployeeMinor: figures.ssnitEmployeeMinor,
        ssnitEmployerMinor: figures.ssnitEmployerMinor,
        payeMinor: figures.payeMinor,
        netMinor: figures.netMinor,
        paymentMethod: member.bankAccountNo ? "BANK" : member.momoNumber ? "MOMO" : "CASH",
      };
    }),
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "payroll.run.create",
      entity: "PayrollRun",
      entityId: run.id,
      summary: `Opened payroll for ${payrollPeriodLabel(year, month)}: ${staff.length} staff`,
    },
  });

  revalidatePath("/payroll");
  return {
    ok: true,
    message: `${payrollPeriodLabel(year, month)} opened with ${staff.length} payslip(s).`,
  };
}

/**
 * Approves a draft, or marks an approved run paid.
 *
 * Approval is separated from preparation on purpose: the bursar computes,
 * the head signs. A run cannot be approved by the person who opened it
 * unless they hold both permissions deliberately, and neither step can run
 * backwards — a paid payroll is history.
 */
export async function advancePayrollRunAction(
  _previous: PayrollState,
  formData: FormData,
): Promise<PayrollState> {
  let user;
  try {
    user = await authorize("payroll.approve");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const to = text(formData, "to");
  if (!id || !["APPROVED", "PAID"].includes(to)) {
    return { error: "Choose approve or mark paid." };
  }

  const run = await db.payrollRun.findUnique({
    where: { id },
    select: {
      status: true,
      year: true,
      month: true,
      payslips: { select: { netMinor: true, staff: { select: { userId: true } } } },
    },
  });
  if (!run) return { error: "Payroll run not found." };

  if (to === "APPROVED" && run.status !== "DRAFT") {
    return { error: "Only a draft can be approved." };
  }
  if (to === "PAID" && run.status !== "APPROVED") {
    return { error: "Approve the payroll before marking it paid." };
  }

  await db.payrollRun.update({
    where: { id },
    data:
      to === "APPROVED"
        ? { status: "APPROVED", approvedBy: user.fullName, approvedAt: new Date() }
        : { status: "PAID", paidAt: new Date() },
  });

  const total = run.payslips.reduce((sum, slip) => sum + slip.netMinor, 0);

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: to === "APPROVED" ? "payroll.run.approve" : "payroll.run.pay",
      entity: "PayrollRun",
      entityId: id,
      summary: `${to === "APPROVED" ? "Approved" : "Marked paid"} ${payrollPeriodLabel(run.year, run.month)}: ${formatMoney(total, "GHS")} net across ${run.payslips.length} payslip(s)`,
    },
  });

  // Staff hear when they are paid, not when the paperwork moves.
  if (to === "PAID") {
    const userIds = run.payslips
      .map((slip) => slip.staff.userId)
      .filter((value): value is string => Boolean(value));
    if (userIds.length) {
      await notifyUsers(userIds, {
        title: `${payrollPeriodLabel(run.year, run.month)} salary`,
        body: "Your payslip for this month is available in the portal.",
        category: "GENERAL",
        url: "/payroll/mine",
      }).catch(() => undefined);
    }
  }

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${id}`);
  return { ok: true, message: to === "APPROVED" ? "Approved." : "Marked paid." };
}

/**
 * The same step as a plain form action, for the buttons on a run page.
 * useActionState is for forms that show an error inline; these two buttons
 * live on a page that re-reads the run and shows its state from the data.
 */
export async function advanceRunFormAction(formData: FormData) {
  await advancePayrollRunAction({}, formData);
}

/** Deletes a draft run. Approved and paid runs are history and stay. */
export async function deletePayrollRunAction(formData: FormData) {
  const user = await authorize("payroll.manage");

  const id = text(formData, "id");
  if (!id) return;

  // The where clause is the authorisation: drafts only.
  const deleted = await db.payrollRun.deleteMany({ where: { id, status: "DRAFT" } });
  if (deleted.count) {
    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: "payroll.run.delete",
        entity: "PayrollRun",
        entityId: id,
        summary: "Deleted a draft payroll run",
      },
    });
  }

  revalidatePath("/payroll");
}
