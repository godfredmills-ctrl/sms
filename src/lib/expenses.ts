import "server-only";

import type { ExpenseStatus } from "@prisma/client";

import { db } from "./db";
import { nextDocumentNumber } from "./finance";
import { formatMoney, sumMinor } from "./money";

// The statuses, the transitions between them and their labels live in
// lib/expense-labels.ts, which the client table imports too. This module is
// server-only and cannot be reached from a client component at all.

/**
 * Expenditure: what the school spends, and what that adds up to.
 *
 * The fee side of this system answers "what did we bill and what came in".
 * This answers the other half, and the two only meet in one place — the
 * income and expenditure statement at the bottom of this file, which is the
 * reason the rest of it exists. A board does not ask for a list of bills; it
 * asks whether the term paid for itself.
 *
 * Everything is minor units (pesewas), like every other amount in this system.
 */

/** Only these two are money the school has actually committed. */
export const COMMITTED: ExpenseStatus[] = ["APPROVED", "PAID"];

/** "EXP-2026-00041". The unique constraint is the real guard; this retries. */
export function nextExpenseReference(attempt = 0) {
  return nextDocumentNumber("EXP", () => db.expense.count(), attempt);
}

// -----------------------------------------------------------------------------
// The income and expenditure statement
// -----------------------------------------------------------------------------

export type StatementLine = {
  label: string;
  /** Cedis in minor units. */
  amountMinor: number;
  /** What was budgeted for the year, where there is a budget. */
  budgetMinor?: number;
  note?: string;
};

export type Statement = {
  period: { label: string; from: Date; to: Date };
  income: StatementLine[];
  incomeMinor: number;
  expenditure: StatementLine[];
  expenditureMinor: number;
  /** Positive is a surplus, negative a deficit. */
  resultMinor: number;
  /** Approved but unpaid at the end of the period — owed, not yet gone. */
  committedMinor: number;
  /** Awaiting approval, so not in the figures above at all. */
  pendingMinor: number;
};

/**
 * What the school took and what it spent, over a period.
 *
 * On a cash basis, which is what a school bursar keeps and what the figures
 * in this system can honestly support: income is money received, not money
 * billed. Billing already has its own report — a debtors list — and mixing
 * the two produces a statement that shows a surplus made entirely of fees
 * nobody has paid.
 *
 * The three parts of the expenditure are deliberately separate. Payroll comes
 * from the payroll runs and is by far the largest line; the provider charges
 * come off the payments themselves and are invisible anywhere else; the rest
 * is what somebody entered as a bill.
 */
export async function buildStatement(input: {
  from: Date;
  to: Date;
  label: string;
  /** Budget figures are annual, so they only mean anything with a year. */
  academicYearId?: string | null;
}): Promise<Statement> {
  const { from, to } = input;
  const window = { gte: from, lte: to };

  const [payments, payslips, expenses, categories, budgets] = await Promise.all([
    db.payment.findMany({
      where: { status: "SUCCESS", paidAt: window },
      select: { amountMinor: true, feeMinor: true, refundedMinor: true, channel: true },
    }),
    // A payroll run belongs to a month, not to a date, so it is matched on
    // the month it covers rather than on when somebody pressed the button.
    db.payslip.findMany({
      where: {
        run: {
          status: { in: ["APPROVED", "PAID"] },
          OR: monthsBetween(from, to),
        },
      },
      select: { grossMinor: true, ssnitEmployerMinor: true },
    }),
    db.expense.findMany({
      where: { incurredOn: window },
      select: {
        amountMinor: true,
        status: true,
        categoryId: true,
        category: { select: { name: true, sortOrder: true } },
      },
    }),
    db.expenseCategory.findMany({
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    input.academicYearId
      ? db.budgetLine.findMany({
          where: { academicYearId: input.academicYearId },
          select: { categoryId: true, amountMinor: true },
        })
      : Promise.resolve([]),
  ]);

  // --- Income ---------------------------------------------------------------
  // Gross of the provider's cut, which appears as a cost below. Netting it off
  // here would hide what collecting the money costs, which is the one number
  // that argues for changing how it is collected.
  const received = sumMinor(payments.map((payment) => payment.amountMinor));
  const refunded = sumMinor(payments.map((payment) => payment.refundedMinor));
  const scholarship = sumMinor(
    payments
      .filter((payment) => payment.channel === "SCHOLARSHIP")
      .map((payment) => payment.amountMinor),
  );

  const income: StatementLine[] = [
    {
      label: "Fees received",
      amountMinor: received - scholarship,
      note: "Money in, on the day it was received.",
    },
  ];
  if (scholarship) {
    income.push({
      label: "Scholarships and sponsorships",
      amountMinor: scholarship,
      note: "Settled by a sponsor rather than by the family.",
    });
  }
  if (refunded) {
    income.push({ label: "Less refunds", amountMinor: -refunded });
  }

  // --- Expenditure ----------------------------------------------------------
  const payrollMinor = sumMinor(
    payslips.map((slip) => slip.grossMinor + slip.ssnitEmployerMinor),
  );
  const chargesMinor = sumMinor(payments.map((payment) => payment.feeMinor));

  const budgetFor = new Map(budgets.map((line) => [line.categoryId, line.amountMinor]));
  const spentByCategory = new Map<string, number>();
  for (const expense of expenses) {
    if (!COMMITTED.includes(expense.status)) continue;
    spentByCategory.set(
      expense.categoryId,
      (spentByCategory.get(expense.categoryId) ?? 0) + expense.amountMinor,
    );
  }

  const expenditure: StatementLine[] = [];
  if (payrollMinor) {
    expenditure.push({
      label: "Staff costs",
      amountMinor: payrollMinor,
      note: "Gross pay and the school's SSNIT contribution.",
    });
  }
  for (const category of categories) {
    const spent = spentByCategory.get(category.id) ?? 0;
    const budget = budgetFor.get(category.id);
    // A category with neither spending nor a budget is not a line on a
    // statement; it is an unused row in a settings table.
    if (!spent && budget === undefined) continue;
    expenditure.push({
      label: category.name,
      amountMinor: spent,
      ...(budget === undefined ? {} : { budgetMinor: budget }),
    });
  }
  if (chargesMinor) {
    expenditure.push({
      label: "Payment provider charges",
      amountMinor: chargesMinor,
      note: "The cost of collecting the fees above.",
    });
  }

  const incomeMinor = sumMinor(income.map((line) => line.amountMinor));
  const expenditureMinor = sumMinor(expenditure.map((line) => line.amountMinor));

  return {
    period: { label: input.label, from, to },
    income,
    incomeMinor,
    expenditure,
    expenditureMinor,
    resultMinor: incomeMinor - expenditureMinor,
    committedMinor: sumMinor(
      expenses.filter((e) => e.status === "APPROVED").map((e) => e.amountMinor),
    ),
    pendingMinor: sumMinor(
      expenses.filter((e) => e.status === "PENDING").map((e) => e.amountMinor),
    ),
  };
}

/**
 * The payroll months a date range covers, as a Prisma OR.
 *
 * A run is stored as a year and a month rather than a date, so it cannot be
 * matched with a range. Any month the range touches at all counts: a term
 * running 8 January to 28 March is paying salaries for January, February and
 * March, and dropping January because the term started on the eighth would
 * take a third of the staff costs off the statement.
 */
function monthsBetween(from: Date, to: Date): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const last = new Date(to.getFullYear(), to.getMonth(), 1);

  // A guard rather than a while(true): a reversed range would otherwise spin.
  while (cursor <= last && months.length < 240) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Nothing at all would make the OR empty, which Prisma reads as "no
  // condition" — every payslip ever written. An impossible month instead.
  return months.length ? months : [{ year: 0, month: 0 }];
}

/**
 * The period to report on.
 *
 * A named term by default, because that is the unit a school board meets in.
 * Falling back to "this year so far" rather than to all time: a statement
 * covering every term the school has ever run is a number nobody can act on.
 */
export async function resolvePeriod(termId: string) {
  const term = termId
    ? await db.term.findUnique({
        where: { id: termId },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          academicYearId: true,
          academicYear: { select: { name: true } },
        },
      })
    : await db.term.findFirst({
        where: { isCurrent: true },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          academicYearId: true,
          academicYear: { select: { name: true } },
        },
      });

  if (term) {
    return {
      from: term.startDate,
      to: term.endDate,
      label: `${term.name}, ${term.academicYear.name}`,
      academicYearId: term.academicYearId,
    };
  }

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (year) {
    return {
      from: year.startDate,
      to: year.endDate,
      label: year.name,
      academicYearId: year.id,
    };
  }

  const now = new Date();
  return {
    from: new Date(now.getFullYear(), 0, 1),
    to: new Date(now.getFullYear(), 11, 31, 23, 59, 59),
    label: String(now.getFullYear()),
    academicYearId: null,
  };
}

/**
 * The statement as a Markdown document.
 *
 * Rendered through renderDocumentPdf rather than by a renderer of its own.
 * This is a document for a board meeting: it wants the school's letterhead, a
 * table that breaks properly across pages, and a signature block — all of
 * which that renderer already does and has been checked doing. A second
 * renderer would be a second place for the cedi sign, a Ghanaian name, or a
 * long category to go wrong.
 */
export function statementMarkdown(statement: Statement): string {
  const money = (minor: number) => formatMoney(minor);
  const lines: string[] = [];

  lines.push(
    `Money received and money spent over ${statement.period.label}, on the dates it moved.`,
    "",
    "## Income",
    "",
    "| Item | Amount |",
    "| --- | --- |",
  );
  for (const line of statement.income) {
    lines.push(`| ${line.label} | ${money(line.amountMinor)} |`);
  }
  lines.push(`| **Total received** | **${money(statement.incomeMinor)}** |`, "");

  const budgeted = statement.expenditure.some((line) => line.budgetMinor !== undefined);
  lines.push(
    "## Expenditure",
    "",
    budgeted ? "| Item | Budget | Amount |" : "| Item | Amount |",
    budgeted ? "| --- | --- | --- |" : "| --- | --- |",
  );
  for (const line of statement.expenditure) {
    const amount = money(line.amountMinor);
    lines.push(
      budgeted
        ? `| ${line.label} | ${line.budgetMinor === undefined ? "—" : money(line.budgetMinor)} | ${amount} |`
        : `| ${line.label} | ${amount} |`,
    );
  }
  lines.push(
    budgeted
      ? `| **Total spent** | | **${money(statement.expenditureMinor)}** |`
      : `| **Total spent** | **${money(statement.expenditureMinor)}** |`,
    "",
  );

  const surplus = statement.resultMinor >= 0;
  lines.push(
    `## ${surplus ? "Surplus" : "Deficit"} for the period: ${money(Math.abs(statement.resultMinor))}`,
    "",
  );

  if (statement.committedMinor || statement.pendingMinor) {
    lines.push("### Not in the figures above", "");
    if (statement.committedMinor) {
      lines.push(
        `- ${money(statement.committedMinor)} approved and not yet paid. The school owes this; the money has not left the account.`,
      );
    }
    if (statement.pendingMinor) {
      lines.push(
        `- ${money(statement.pendingMinor)} recorded and awaiting approval. Until it is approved it is not counted as spending at all.`,
      );
    }
    lines.push("");
  }

  lines.push(
    "---",
    "",
    "Prepared on a cash basis: fees are counted on the day they were received, not the day they were billed. Fees billed and unpaid are a debt owed to the school and appear on the debtors report — counting them here would show a surplus made of money nobody has paid.",
  );

  return lines.join("\n");
}
