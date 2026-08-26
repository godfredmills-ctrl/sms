import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  FileDown,
  ListTree,
  Plus,
  Scale,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { hasChartOfAccounts, journalList, ledgerReports } from "@/lib/ledger";
import { accountTypeLabel } from "@/lib/ledger-rules";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "General Ledger" };
export const dynamic = "force-dynamic";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("finance.ledger.read");
  const params = await searchParams;

  const [charted, reports, journal] = await Promise.all([
    hasChartOfAccounts(),
    ledgerReports(),
    journalList({ status: String(params.status ?? "") || undefined, take: 25 }),
  ]);

  const mayRecord = userCan(user, "finance.ledger.record");
  const mayManage = userCan(user, "finance.ledger.manage");

  const { trial, income, sheet } = reports;
  const drafts = journal.entries.filter((entry) => entry.status === "DRAFT").length;

  return (
    <>
      <PageHeader
        title="General ledger"
        description="Double entry underneath the fee ledger and the expenditure book. What the accounts say, and whether they balance."
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/api/finance/ledger/reports" variant="secondary" size="sm">
              <FileDown className="size-4" />
              Print the statements
            </LinkButton>
            {mayManage ? (
              <LinkButton href="/finance/ledger/accounts" variant="secondary" size="sm">
                <ListTree className="size-4" />
                Chart of accounts
              </LinkButton>
            ) : null}
            {mayRecord && charted ? (
              <LinkButton href="/finance/ledger/new" size="sm">
                <Plus className="size-4" />
                New entry
              </LinkButton>
            ) : null}
          </div>
        }
      />

      {!charted ? (
        <Alert tone="info" className="mb-4">
          There is no chart of accounts yet, and nothing can be posted without
          one.{" "}
          {mayManage ? (
            <Link href="/finance/ledger/accounts" className="font-medium underline">
              Set it up first
            </Link>
          ) : (
            "Ask whoever manages the accounts to set it up."
          )}
          .
        </Alert>
      ) : null}

      {!trial.balanced ? (
        <Alert tone="danger" className="mb-4">
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>
                The trial balance is out by {formatMoney(Math.abs(trial.differenceMinor))}.
              </strong>{" "}
              Every entry is checked before it is posted, so this should not be
              possible. It means something reached the ledger without going
              through the posting rules, and nothing drawn from these accounts
              should be relied on until it is found.
            </span>
          </span>
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Trial balance"
          value={trial.balanced ? "Balanced" : "Out"}
          hint={`${formatMoney(trial.debitMinor, "GHS", { compact: true })} each side`}
          tone={trial.balanced ? "success" : "danger"}
          icon={<Scale className="size-4" />}
        />
        <StatCard
          label="Income"
          value={formatMoney(income.income.totalMinor, "GHS", { compact: true })}
          hint="Posted to date"
          tone="info"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Expenditure"
          value={formatMoney(income.expenses.totalMinor, "GHS", { compact: true })}
          hint="Posted to date"
          tone="neutral"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label={income.surplusMinor >= 0 ? "Surplus" : "Deficit"}
          value={formatMoney(Math.abs(income.surplusMinor), "GHS", { compact: true })}
          hint={sheet.balanced ? "Balance sheet agrees" : "Balance sheet does not agree"}
          tone={income.surplusMinor >= 0 ? "success" : "warning"}
          icon={<BookOpen className="size-4" />}
        />
      </div>

      {drafts ? (
        <Alert tone="warning" className="mb-4">
          {drafts} entr{drafts === 1 ? "y is" : "ies are"} still a draft and
          affecting nothing. A draft is somebody&rsquo;s working until it is
          posted.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Trial balance"
            description="Every account with a movement, on the side it falls."
          />
          <CardBody className="overflow-x-auto p-0">
            {trial.rows.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                    <th className="px-3 py-2 font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">Debit</th>
                    <th className="px-3 py-2 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {trial.rows.map((row) => (
                    <tr
                      key={row.accountId}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/finance/ledger/accounts/${row.accountId}`}
                          className="hover:text-[var(--primary)] hover:underline"
                        >
                          <span className="numeric text-[var(--text-subtle)]">{row.code}</span>{" "}
                          {row.name}
                        </Link>
                        <span className="block text-xs text-[var(--text-subtle)]">
                          {accountTypeLabel(row.type)}
                        </span>
                      </td>
                      <td className="numeric px-3 py-1.5 text-right">
                        {row.side === "DEBIT" ? formatMoney(row.columnMinor) : ""}
                      </td>
                      <td className="numeric px-3 py-1.5 text-right">
                        {row.side === "CREDIT" ? formatMoney(row.columnMinor) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--border)] font-medium">
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]">Totals</td>
                    <td className="numeric px-3 py-2 text-right">
                      {formatMoney(trial.debitMinor)}
                    </td>
                    <td className="numeric px-3 py-2 text-right">
                      {formatMoney(trial.creditMinor)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <EmptyState
                title="Nothing has been posted"
                description="The trial balance is drawn from posted entries only."
              />
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Income and expenditure" description="Posted to date." />
            <CardBody className="space-y-2 text-sm">
              {income.income.rows.map((row) => (
                <div key={row.accountId} className="flex justify-between gap-3">
                  <span className="truncate text-[var(--text-muted)]">{row.name}</span>
                  <span className="numeric">{formatMoney(row.balanceMinor)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-2 font-medium">
                <span>Income</span>
                <span className="numeric">{formatMoney(income.income.totalMinor)}</span>
              </div>

              {income.expenses.rows.map((row) => (
                <div key={row.accountId} className="flex justify-between gap-3">
                  <span className="truncate text-[var(--text-muted)]">{row.name}</span>
                  <span className="numeric">{formatMoney(row.balanceMinor)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-2 font-medium">
                <span>Expenditure</span>
                <span className="numeric">{formatMoney(income.expenses.totalMinor)}</span>
              </div>

              <div className="flex justify-between gap-3 border-t-2 border-[var(--border)] pt-2 font-semibold">
                <span>{income.surplusMinor >= 0 ? "Surplus" : "Deficit"}</span>
                <span className="numeric">
                  {formatMoney(Math.abs(income.surplusMinor))}
                </span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Balance sheet"
              description={
                sheet.balanced
                  ? "Assets equal what funds them."
                  : `Out by ${formatMoney(Math.abs(sheet.differenceMinor))}.`
              }
            />
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between gap-3 font-medium">
                <span>Assets</span>
                <span className="numeric">{formatMoney(sheet.assetsMinor)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[var(--text-muted)]">Liabilities</span>
                <span className="numeric">{formatMoney(sheet.liabilities.totalMinor)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[var(--text-muted)]">Funds</span>
                <span className="numeric">{formatMoney(sheet.equity.totalMinor)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[var(--text-muted)]">
                  {sheet.surplusMinor >= 0 ? "Surplus for the period" : "Deficit for the period"}
                </span>
                <span className="numeric">{formatMoney(sheet.surplusMinor)}</span>
              </div>
              <div className="flex justify-between gap-3 border-t-2 border-[var(--border)] pt-2 font-semibold">
                <span>Funded by</span>
                <span className="numeric">{formatMoney(sheet.fundedMinor)}</span>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Recent entries"
          description="Newest first. A posted entry is never edited, only reversed."
        />
        <CardBody className="overflow-x-auto p-0">
          {journal.entries.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">What for</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {journal.entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-subtle)]"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/finance/ledger/${entry.id}`}
                        className="numeric font-medium text-[var(--primary)] hover:underline"
                      >
                        {entry.reference}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {formatDate(entry.entryDate)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="truncate">{entry.narration}</span>
                      {entry.source !== "manual" ? (
                        <span className="block text-xs text-[var(--text-subtle)]">
                          from {entry.source}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        tone={
                          entry.status === "POSTED"
                            ? "success"
                            : entry.status === "DRAFT"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {entry.status === "POSTED"
                          ? "Posted"
                          : entry.status === "DRAFT"
                            ? "Draft"
                            : "Void"}
                      </Badge>
                      {entry.reversedBy ? (
                        <span className="block text-xs text-[var(--text-subtle)]">
                          reversed by {entry.reversedBy.reference}
                        </span>
                      ) : null}
                    </td>
                    <td className="numeric px-3 py-2 text-right">
                      {formatMoney(entry.totalMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title="No entries yet"
              description="Entries appear here as they are written, whether or not they have been posted."
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
