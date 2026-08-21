"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { canBecome } from "@/lib/expense-labels";
import { nextExpenseReference } from "@/lib/expenses";
import { toMinor } from "@/lib/money";

export type ExpenseState = {
  ok?: boolean;
  error?: string;
  message?: string;
  id?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** The term and year a date falls in, so a statement can be run by term. */
async function periodFor(date: Date) {
  const term = await db.term.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true, academicYearId: true },
  });
  if (term) return { termId: term.id, academicYearId: term.academicYearId };

  // Out of term — a holiday, or a bill dated before the year was set up. The
  // year still holds it, so it is not simply lost from the annual figures.
  const year = await db.academicYear.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true },
  });
  return { termId: null, academicYearId: year?.id ?? null };
}

/**
 * Records a bill, or edits one that has not been approved yet.
 *
 * An approved or paid expense is not editable here. It is a figure somebody
 * signed off and, once paid, a record of money that has left the account —
 * changing it in place would make the statement disagree with the bank
 * without anything saying so. Void it and record it again.
 */
export async function saveExpenseAction(
  _previous: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  let user;
  try {
    user = await authorize("finance.expense.record");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const description = text(formData, "description");
  const categoryId = text(formData, "categoryId");
  const amount = text(formData, "amount");

  if (!description) return { error: "Say what the money was for." };
  if (!categoryId) return { error: "Choose a category." };

  const amountMinor = toMinor(amount);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { error: "Enter an amount greater than zero." };
  }

  const taxMinor = text(formData, "tax") ? toMinor(text(formData, "tax")) : 0;
  if (!Number.isFinite(taxMinor) || taxMinor < 0) {
    return { error: "Withholding tax cannot be negative." };
  }
  // Tax is withheld from the amount rather than added to it, so more tax than
  // there is bill is not a rounding question — it is a typing mistake.
  if (taxMinor > amountMinor) {
    return { error: "Withholding tax cannot be more than the amount of the bill." };
  }

  const incurredOn = new Date(text(formData, "incurredOn"));
  if (Number.isNaN(incurredOn.getTime())) {
    return { error: "Give the date the cost was incurred." };
  }

  const category = await db.expenseCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, active: true },
  });
  if (!category) return { error: "That category no longer exists." };

  // A retired category stays selectable on a bill that already uses it — its
  // own history has to keep its name — but nothing new may be filed under it,
  // or a line somebody closed on last year's statement quietly reopens.
  const alreadyThere = id
    ? (await db.expense.findUnique({ where: { id }, select: { categoryId: true } }))
        ?.categoryId === categoryId
    : false;
  if (!category.active && !alreadyThere) {
    return {
      error: `${category.name} is no longer in use. Choose another category, or put it back in use first.`,
    };
  }

  const vendorId = text(formData, "vendorId") || null;
  if (vendorId) {
    const vendor = await db.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!vendor) return { error: "That vendor no longer exists." };
  }

  const period = await periodFor(incurredOn);

  const data = {
    categoryId,
    vendorId,
    description,
    amountMinor,
    taxMinor,
    incurredOn,
    notes: text(formData, "notes") || null,
    ...period,
  };

  if (id) {
    const existing = await db.expense.findUnique({
      where: { id },
      select: { status: true, reference: true },
    });
    if (!existing) return { error: "That expense was not found." };
    if (existing.status !== "PENDING" && existing.status !== "REJECTED") {
      return {
        error:
          "This has already been approved. Void it and record it again, so the change is on the record.",
      };
    }

    await db.expense.update({ where: { id }, data });
    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: "expense.update",
        entity: "Expense",
        entityId: id,
        summary: `Edited ${existing.reference}: ${description.slice(0, 60)}`,
      },
    });

    revalidatePath("/finance/expenses");
    revalidatePath(`/finance/expenses/${id}`);
    return { ok: true, id, message: "Saved." };
  }

  let created: { id: string; reference: string } | null = null;
  for (let attempt = 0; attempt < 4 && !created; attempt += 1) {
    try {
      created = await db.expense.create({
        data: {
          ...data,
          reference: await nextExpenseReference(attempt),
          requestedById: user.id,
        },
        select: { id: true, reference: true },
      });
    } catch (error) {
      // Only a clash on the reference is worth another go.
      if (attempt === 3 || !String(error).includes("reference")) throw error;
    }
  }
  if (!created) return { error: "Could not allocate a reference. Try again." };

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "expense.create",
      entity: "Expense",
      entityId: created.id,
      summary: `Recorded ${created.reference}: ${description.slice(0, 60)}`,
    },
  });

  revalidatePath("/finance/expenses");
  redirect(`/finance/expenses/${created.id}`);
}

/**
 * Approve, turn down, void, or mark paid.
 *
 * One action for all four because they are the same decision from the same
 * page and share the same rules about what may follow what — the alternative
 * is four actions that each have to remember the transition table.
 *
 * Nobody approves their own expenditure. That is the whole point of the
 * approval existing: a bursar who can record a bill and approve it has not
 * been checked by anybody. The head teacher holds the permission by default
 * for exactly this reason.
 */
export async function decideExpenseAction(formData: FormData): Promise<ExpenseState> {
  const to = text(formData, "status");
  const id = text(formData, "id");
  if (!id) return { error: "Which expense?" };

  // Read first, so which permission this needs can depend on what is being
  // undone: voiding a bill you have just entered is part of entering it,
  // while voiding one that has been approved — or paid — takes it back out of
  // the statement, and that is an approver's decision.
  try {
    await authorize("finance.expense.read");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const expense = await db.expense.findUnique({
    where: { id },
    select: {
      status: true,
      reference: true,
      amountMinor: true,
      requestedById: true,
      description: true,
    },
  });
  if (!expense) return { error: "That expense was not found." };

  if (!canBecome(expense.status, to)) {
    return { error: `A ${expense.status.toLowerCase()} expense cannot become ${to.toLowerCase()}.` };
  }

  const needed =
    to === "PAID"
      ? "finance.expense.pay"
      : to === "VOID" && (expense.status === "PENDING" || expense.status === "REJECTED")
        ? "finance.expense.record"
        : "finance.expense.approve";

  let user;
  try {
    user = await authorize(needed);
  } catch (error) {
    return { error: (error as Error).message };
  }

  if (to === "APPROVED" && expense.requestedById === user.id) {
    return {
      error:
        "You recorded this, so somebody else has to approve it. Ask the head teacher, or whoever else can approve expenditure.",
    };
  }

  if (to === "PAID") {
    const paidOn = new Date(text(formData, "paidOn"));
    if (Number.isNaN(paidOn.getTime())) return { error: "Give the date it was paid." };
    if (!text(formData, "method")) return { error: "How was it paid?" };

    await db.expense.update({
      where: { id },
      data: {
        status: "PAID",
        paidOn,
        method: text(formData, "method"),
        paymentRef: text(formData, "paymentRef") || null,
      },
    });
  } else {
    await db.expense.update({
      where: { id },
      data: {
        status: to as "APPROVED" | "REJECTED" | "VOID" | "PENDING",
        approvedById: to === "APPROVED" ? user.id : null,
        approvedAt: to === "APPROVED" ? new Date() : null,
        decisionNote: text(formData, "note") || null,
      },
    });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: `expense.${to.toLowerCase()}`,
      entity: "Expense",
      entityId: id,
      summary: `${expense.reference} ${to.toLowerCase()}: ${expense.description.slice(0, 50)}`,
    },
  });

  revalidatePath("/finance/expenses");
  revalidatePath(`/finance/expenses/${id}`);
  revalidatePath("/finance/statement");
  return { ok: true, message: "Done." };
}
