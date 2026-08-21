"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Save } from "lucide-react";

import { Alert, Button } from "@/components/ui";
import { formatMoney } from "@/lib/money";

import { saveBudgetAction, type BudgetState } from "./actions";

export type BudgetRow = {
  categoryId: string;
  name: string;
  kind: string;
  code: string | null;
  /** What is budgeted, as a decimal string. Empty means no budget set. */
  amount: string;
  /** Committed spending against it so far this year. */
  spentMinor: number;
};

/**
 * The year's budget, edited as one table.
 *
 * Every line is submitted together because a budget is a set of figures that
 * add up to something. Saving them one at a time leaves the school with half
 * of last year's and half of this year's and nothing to say which is which.
 *
 * The total updates as you type, and the spending already committed sits
 * beside each line — a budget set without looking at what has already gone is
 * how a category is under-provided in the first week of term.
 */
export function BudgetForm({
  academicYearId,
  yearName,
  rows,
}: {
  academicYearId: string;
  yearName: string;
  rows: BudgetRow[];
}) {
  const [state, action] = useActionState<BudgetState, FormData>(saveBudgetAction, {});
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.categoryId, row.amount])),
  );

  const { totalMinor, setLines } = useMemo(() => {
    let total = 0;
    let lines = 0;
    for (const value of Object.values(amounts)) {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed)) continue;
      total += Math.round(parsed * 100);
      lines += 1;
    }
    return { totalMinor: total, setLines: lines };
  }, [amounts]);

  const committedMinor = rows.reduce((sum, row) => sum + row.spentMinor, 0);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="academicYearId" value={academicYearId} />

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left">
                <th className="px-4 py-2.5 font-medium text-[var(--text-muted)]">Category</th>
                <th className="px-4 py-2.5 text-right font-medium text-[var(--text-muted)]">
                  Committed so far
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-[var(--text-muted)]">
                  Budget for {yearName}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const parsed = Number.parseFloat(amounts[row.categoryId] ?? "");
                const budgetMinor = Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
                const over = budgetMinor !== null && row.spentMinor > budgetMinor;

                return (
                  <tr
                    key={row.categoryId}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-2">
                      <label
                        htmlFor={`budget-${row.categoryId}`}
                        className="text-[var(--text)]"
                      >
                        {row.name}
                      </label>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {[row.code, row.kind.toLowerCase()].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <p
                        className={`numeric ${
                          over ? "text-[var(--danger)]" : "text-[var(--text-muted)]"
                        }`}
                      >
                        {formatMoney(row.spentMinor)}
                      </p>
                      {over ? (
                        <p className="numeric text-xs text-[var(--danger)]">
                          over by {formatMoney(row.spentMinor - budgetMinor)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        id={`budget-${row.categoryId}`}
                        name={`amount:${row.categoryId}`}
                        inputMode="decimal"
                        placeholder="none"
                        value={amounts[row.categoryId] ?? ""}
                        onChange={(event) =>
                          setAmounts((current) => ({
                            ...current,
                            [row.categoryId]: event.target.value,
                          }))
                        }
                        className="numeric w-32 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-right text-[var(--text)] outline-none focus:border-[var(--primary)]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--surface-2)]">
                <td className="px-4 py-2.5 font-medium text-[var(--text)]">
                  {setLines} of {rows.length} line{rows.length === 1 ? "" : "s"} budgeted
                </td>
                <td className="numeric px-4 py-2.5 text-right text-[var(--text-muted)]">
                  {formatMoney(committedMinor)}
                </td>
                <td className="numeric px-4 py-2.5 text-right font-semibold text-[var(--text)]">
                  {formatMoney(totalMinor)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="max-w-2xl text-sm text-[var(--text-muted)]">
        A blank figure means no budget was set for that line, which is different from
        budgeting nothing — the statement shows the first as a dash and the second as
        zero, and only the second is being overspent.
      </p>

      <SaveButton />
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Save className="size-4" />
      {pending ? "Saving…" : "Save the budget"}
    </Button>
  );
}
