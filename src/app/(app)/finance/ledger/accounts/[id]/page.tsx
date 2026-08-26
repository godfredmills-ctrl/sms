import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { accountLedger } from "@/lib/ledger";
import { accountTypeLabel, normalSide } from "@/lib/ledger-rules";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await accountLedger(id);
  return {
    title: detail ? `${detail.account.code} ${detail.account.name}` : "Account",
  };
}

/**
 * One account, movement by movement.
 *
 * This is the page somebody opens when a figure on a statement looks wrong, so
 * it shows the balance after every entry rather than only the total. Finding
 * where a number went astray means seeing the moment it changed.
 */
export default async function LedgerAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("finance.ledger.read");
  const { id } = await params;

  const detail = await accountLedger(id);
  if (!detail) notFound();

  const { account, rows, closingMinor } = detail;

  return (
    <>
      <Link
        href="/finance/ledger/accounts"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-4" />
        Back to the chart of accounts
      </Link>

      <PageHeader
        title={`${account.code} ${account.name}`}
        description={account.description ?? accountTypeLabel(account.type)}
        action={
          <span className="flex items-center gap-1.5">
            <Badge tone="neutral">{accountTypeLabel(account.type)}</Badge>
            <Badge tone={closingMinor >= 0 ? "success" : "warning"}>
              {formatMoney(Math.abs(closingMinor))}{" "}
              {closingMinor >= 0
                ? normalSide(account.type).toLowerCase()
                : normalSide(account.type) === "DEBIT"
                  ? "credit"
                  : "debit"}
            </Badge>
          </span>
        }
      />

      <Card>
        <CardHeader
          title="Movements"
          description="Posted entries only, oldest first, with the balance after each one."
        />
        <CardBody className="overflow-x-auto p-0">
          {rows.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 font-medium">What for</th>
                  <th className="px-3 py-2 text-right font-medium">Debit</th>
                  <th className="px-3 py-2 text-right font-medium">Credit</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-1.5 whitespace-nowrap text-xs">
                      {formatDate(row.entry.entryDate)}
                    </td>
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/finance/ledger/${row.entry.id}`}
                        className="numeric text-[var(--primary)] hover:underline"
                      >
                        {row.entry.reference}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="truncate">{row.entry.narration}</span>
                      {row.memo ? (
                        <span className="block text-xs text-[var(--text-subtle)]">
                          {row.memo}
                        </span>
                      ) : null}
                    </td>
                    <td className="numeric px-3 py-1.5 text-right">
                      {row.debitMinor ? formatMoney(row.debitMinor) : ""}
                    </td>
                    <td className="numeric px-3 py-1.5 text-right">
                      {row.creditMinor ? formatMoney(row.creditMinor) : ""}
                    </td>
                    <td className="numeric px-3 py-1.5 text-right font-medium">
                      {formatMoney(row.balanceMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title="Nothing posted to this account"
              description="Only posted entries appear here. A draft affects nothing."
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
