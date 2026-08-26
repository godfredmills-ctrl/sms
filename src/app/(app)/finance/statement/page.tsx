import type { Metadata } from "next";
import Link from "next/link";
import { Printer, TrendingDown, TrendingUp } from "lucide-react";

import { LinkButton, PageHeader, StatCard } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildStatement, resolvePeriod, type StatementLine } from "@/lib/expenses";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Income and expenditure" };
export const dynamic = "force-dynamic";

/**
 * The statement.
 *
 * One page, two columns of figures and a single number at the bottom. That
 * bottom number is the question a board actually asks, and everything else on
 * it exists to be the working behind it — which is why the budget column sits
 * beside the spending rather than on a page of its own.
 */
export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("finance.report");

  const params = await searchParams;
  const period = await resolvePeriod(String(params.term ?? ""));
  const statement = await buildStatement(period);

  const surplus = statement.resultMinor >= 0;

  const terms = await db.term.findMany({
    orderBy: [{ startDate: "desc" }],
    take: 12,
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      academicYear: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Income and expenditure"
        description={`${statement.period.label} · ${formatDate(statement.period.from)} to ${formatDate(statement.period.to)}. Money received and money spent, on the dates it moved.`}
        action={
          <LinkButton
            href={`/api/finance/statement?term=${String(params.term ?? "")}`}
            target="_blank"
            size="sm"
            variant="secondary"
          >
            <Printer className="size-4" />
            Print
          </LinkButton>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {terms.map((term) => {
          const active = String(params.term ?? "") === term.id;
          return (
            <Link
              key={term.id}
              href={`/finance/statement?term=${term.id}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                active
                  ? "border-transparent bg-[var(--primary)] text-white"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {term.name} · {term.academicYear.name}
            </Link>
          );
        })}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Received"
          value={formatMoney(statement.incomeMinor)}
          hint="Money in over the period"
          tone="success"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Spent"
          value={formatMoney(statement.expenditureMinor)}
          hint="Staff costs, bills and charges"
          tone="neutral"
          icon={<TrendingDown className="size-4" />}
        />
        <StatCard
          label={surplus ? "Surplus" : "Deficit"}
          value={formatMoney(Math.abs(statement.resultMinor))}
          hint={surplus ? "The period paid for itself" : "More went out than came in"}
          tone={surplus ? "success" : "danger"}
        />
        {/* Both figures are scoped to this period, like everything else on
            the page. Labelled as a plain total they would read as everything
            the school owes, which is a different and larger number. */}
        <StatCard
          label="Owed from this period"
          value={formatMoney(statement.committedMinor)}
          hint={
            statement.pendingMinor
              ? `${formatMoney(statement.pendingMinor)} more still awaits approval`
              : "Approved here, not yet settled"
          }
          tone={statement.committedMinor > 0 ? "warning" : "neutral"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Income"
          lines={statement.income}
          totalLabel="Total received"
          totalMinor={statement.incomeMinor}
        />
        <Section
          title="Expenditure"
          lines={statement.expenditure}
          totalLabel="Total spent"
          totalMinor={statement.expenditureMinor}
        />
      </div>

      <div
        className={`mt-5 rounded-[var(--radius)] border p-5 ${
          surplus
            ? "border-[var(--success)] bg-[var(--success-soft)]"
            : "border-[var(--danger)] bg-[var(--danger-soft)]"
        }`}
      >
        <p className="text-sm font-medium text-[var(--text-muted)]">
          {surplus ? "Surplus for the period" : "Deficit for the period"}
        </p>
        <p
          className={`numeric text-3xl font-semibold ${
            surplus ? "text-[var(--success)]" : "text-[var(--danger)]"
          }`}
        >
          {formatMoney(Math.abs(statement.resultMinor))}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          On a cash basis: fees are counted on the day they were received, not the day
          they were billed. Unpaid fees are a debt owed to the school and appear on the
          debtors report, not here: a statement that counted them would show a surplus
          made of money nobody has paid.
        </p>
      </div>
    </>
  );
}

function Section({
  title,
  lines,
  totalLabel,
  totalMinor,
}: {
  title: string;
  lines: StatementLine[];
  totalLabel: string;
  totalMinor: number;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
      </div>

      {lines.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--text-subtle)]">
          Nothing recorded for this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {lines.map((line) => {
                const over =
                  line.budgetMinor !== undefined && line.amountMinor > line.budgetMinor;
                return (
                  <tr key={line.label} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="text-[var(--text)]">{line.label}</p>
                      {line.note ? (
                        <p className="text-xs text-[var(--text-subtle)]">{line.note}</p>
                      ) : null}
                    </td>
                    {line.budgetMinor === undefined ? (
                      <td className="px-4 py-2.5 text-right text-xs text-[var(--text-subtle)]">
                        -
                      </td>
                    ) : (
                      <td className="px-4 py-2.5 text-right">
                        <p className="numeric text-xs text-[var(--text-subtle)]">
                          budget {formatMoney(line.budgetMinor)}
                        </p>
                        {over ? (
                          <p className="numeric text-xs text-[var(--danger)]">
                            over by {formatMoney(line.amountMinor - line.budgetMinor)}
                          </p>
                        ) : null}
                      </td>
                    )}
                    <td className="numeric px-4 py-2.5 text-right whitespace-nowrap text-[var(--text)]">
                      {formatMoney(line.amountMinor)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--surface-2)]">
                <td className="px-4 py-2.5 font-medium text-[var(--text)]" colSpan={2}>
                  {totalLabel}
                </td>
                <td className="numeric px-4 py-2.5 text-right font-semibold text-[var(--text)]">
                  {formatMoney(totalMinor)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
