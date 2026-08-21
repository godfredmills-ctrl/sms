"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";

export type BudgetState = { ok?: boolean; error?: string; message?: string };

/**
 * Sets the year's budget, every line at once.
 *
 * One submission for the whole table rather than a save button per row: a
 * budget is agreed as a set of figures that add up to something, and saving
 * them one at a time leaves the school with half of last year's and half of
 * this year's, with nothing to say which is which.
 *
 * A blank figure removes that line, rather than storing a zero. They are
 * different statements — "we did not budget for this" and "we budgeted
 * nothing for this" — and the statement shows them differently.
 */
export async function saveBudgetAction(
  _previous: BudgetState,
  formData: FormData,
): Promise<BudgetState> {
  let user;
  try {
    user = await authorize("finance.budget.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const academicYearId = String(formData.get("academicYearId") ?? "").trim();
  if (!academicYearId) return { error: "Which year?" };

  const year = await db.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true, name: true },
  });
  if (!year) return { error: "That academic year was not found." };

  const categories = await db.expenseCategory.findMany({ select: { id: true } });

  const keep: { categoryId: string; amountMinor: number }[] = [];
  const drop: string[] = [];

  for (const category of categories) {
    const raw = String(formData.get(`amount:${category.id}`) ?? "").trim();
    if (!raw) {
      drop.push(category.id);
      continue;
    }
    const amountMinor = toMinor(raw);
    if (!Number.isFinite(amountMinor) || amountMinor < 0) {
      return { error: "A budget figure cannot be negative." };
    }
    keep.push({ categoryId: category.id, amountMinor });
  }

  // One transaction, so a failure halfway does not leave a budget that is
  // partly this year's and partly last year's.
  await db.$transaction([
    db.budgetLine.deleteMany({
      where: { academicYearId, categoryId: { in: drop } },
    }),
    ...keep.map((line) =>
      db.budgetLine.upsert({
        where: {
          academicYearId_categoryId: { academicYearId, categoryId: line.categoryId },
        },
        create: { academicYearId, categoryId: line.categoryId, amountMinor: line.amountMinor },
        update: { amountMinor: line.amountMinor },
      }),
    ),
  ]);

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "budget.set",
      entity: "AcademicYear",
      entityId: academicYearId,
      summary: `Set the budget for ${year.name}: ${keep.length} line${keep.length === 1 ? "" : "s"}`,
    },
  });

  revalidatePath("/finance/budget");
  revalidatePath("/finance/statement");
  return { ok: true, message: "Budget saved." };
}
