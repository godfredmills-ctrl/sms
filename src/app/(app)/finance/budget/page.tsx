import type { Metadata } from "next";
import Link from "next/link";

import { Alert, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { COMMITTED } from "@/lib/expenses";

import { BudgetForm, type BudgetRow } from "./budget-form";

export const metadata: Metadata = { title: "Budget" };
export const dynamic = "force-dynamic";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("finance.budget.manage");

  const params = await searchParams;
  const wanted = String(params.year ?? "");

  const years = await db.academicYear.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isCurrent: true, startDate: true, endDate: true },
  });

  const year = years.find((entry) => entry.id === wanted) ?? years.find((entry) => entry.isCurrent) ?? years[0];

  if (!year) {
    return (
      <>
        <PageHeader title="Budget" description="What the school plans to spend, by category." />
        <Alert tone="warning" title="There is no academic year yet">
          A budget belongs to a year. Set one up under{" "}
          <Link href="/academics/years" className="underline">
            Academic years
          </Link>{" "}
          first.
        </Alert>
      </>
    );
  }

  const [categories, budgets] = await Promise.all([
    db.expenseCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        code: true,
        // Spending already committed in this year, so the figure being set is
        // set against what has already gone rather than against nothing.
        expenses: {
          where: { status: { in: COMMITTED }, academicYearId: year.id },
          select: { amountMinor: true },
        },
      },
    }),
    db.budgetLine.findMany({
      where: { academicYearId: year.id },
      select: { categoryId: true, amountMinor: true },
    }),
  ]);

  const budgetFor = new Map(budgets.map((line) => [line.categoryId, line.amountMinor]));

  const rows: BudgetRow[] = categories.map((category) => {
    const set = budgetFor.get(category.id);
    return {
      categoryId: category.id,
      name: category.name,
      kind: category.kind,
      code: category.code,
      amount: set === undefined ? "" : (set / 100).toFixed(2),
      spentMinor: category.expenses.reduce((sum, expense) => sum + expense.amountMinor, 0),
    };
  });

  return (
    <>
      <PageHeader
        title="Budget"
        description={`What the school plans to spend in ${year.name}, by category. The statement shows each line against it.`}
      />

      {years.length > 1 ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {years.map((entry) => (
            <Link
              key={entry.id}
              href={`/finance/budget?year=${entry.id}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                entry.id === year.id
                  ? "border-transparent bg-[var(--primary)] text-white"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {entry.name}
              {entry.isCurrent ? " · current" : ""}
            </Link>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Alert tone="warning" title="There are no expense categories yet">
          A budget is a figure per category. Set the categories up under{" "}
          <Link href="/finance/vendors" className="underline">
            Vendors &amp; categories
          </Link>{" "}
          first.
        </Alert>
      ) : (
        <BudgetForm academicYearId={year.id} yearName={year.name} rows={rows} />
      )}
    </>
  );
}
