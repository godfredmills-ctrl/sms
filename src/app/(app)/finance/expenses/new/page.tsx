import type { Metadata } from "next";
import Link from "next/link";

import { Alert, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";

import { ExpenseForm } from "../expense-form";
import { expensePickers, todayValue } from "../pickers";

export const metadata: Metadata = { title: "Record a bill" };
export const dynamic = "force-dynamic";

export default async function NewExpensePage() {
  await requirePermission("finance.expense.record");
  const { categories, vendors } = await expensePickers();

  return (
    <div>
      <PageHeader
        title="Record a bill"
        description="Something the school has to pay for. It goes on the statement once it is approved."
        breadcrumb={
          <Link href="/finance/expenses" className="hover:text-[var(--text)]">
            Expenditure
          </Link>
        }
      />

      {categories.length === 0 ? (
        <Alert tone="warning" title="There are no expense categories yet">
          A bill has to be called something before it can appear on a statement. Set
          the categories up under{" "}
          <Link href="/finance/vendors" className="underline">
            Vendors &amp; categories
          </Link>{" "}
          first.
        </Alert>
      ) : (
        <ExpenseForm categories={categories} vendors={vendors} today={todayValue()} />
      )}
    </div>
  );
}
