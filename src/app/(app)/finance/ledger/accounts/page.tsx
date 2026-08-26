import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { ledgerAccounts } from "@/lib/ledger";
import { ACCOUNT_TYPES, accountTypeLabel, codeMatchesType } from "@/lib/ledger-rules";

import { AccountForm } from "../ledger-forms";

export const metadata: Metadata = { title: "Chart of accounts" };
export const dynamic = "force-dynamic";

export default async function ChartOfAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  await requirePermission("finance.ledger.manage");

  const [accounts, { first }] = await Promise.all([ledgerAccounts(), searchParams]);

  const options = accounts.map((account) => ({
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
  }));

  return (
    <>
      <Link
        href="/finance/ledger"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-4" />
        Back to the ledger
      </Link>

      <PageHeader
        title="Chart of accounts"
        description="Every account the ledger can post to, and what kind of thing each one is."
      />

      {first ? (
        <Alert tone="info" className="mb-4">
          Nothing can be posted before there are accounts to post to. A school
          usually starts with a bank account, cash, fees receivable, suppliers,
          an accumulated fund, tuition income, and the main headings of
          expenditure. The conventional numbering is 1000s for assets, 2000s
          liabilities, 3000s funds, 4000s income and 5000s expenditure.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {ACCOUNT_TYPES.map((type) => {
            const group = accounts.filter((account) => account.type === type.value);
            if (!group.length) return null;

            return (
              <Card key={type.value}>
                <CardHeader title={type.label} description={type.blurb} />
                <CardBody className="space-y-3 p-0">
                  {group.map((account) => (
                    <details key={account.id} className="group border-b border-[var(--border)] last:border-0">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-[var(--bg-subtle)]">
                        <span className="min-w-0">
                          <span className="numeric text-[var(--text-subtle)]">
                            {account.code}
                          </span>{" "}
                          <span className="font-medium">{account.name}</span>
                          {!codeMatchesType(account.code, account.type) ? (
                            <span className="block text-xs text-[var(--warning)]">
                              Outside the usual range for {accountTypeLabel(account.type).toLowerCase()} accounts
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {account.isSystem ? <Badge tone="info">System</Badge> : null}
                          <Badge tone={account.isActive ? "success" : "neutral"}>
                            {account._count.lines} posting
                            {account._count.lines === 1 ? "" : "s"}
                          </Badge>
                        </span>
                      </summary>
                      <div className="px-4 pb-4">
                        <AccountForm
                          parents={options}
                          values={{
                            id: account.id,
                            code: account.code,
                            name: account.name,
                            type: account.type,
                            description: account.description,
                            isActive: account.isActive,
                            isSystem: account.isSystem,
                            postings: account._count.lines,
                          }}
                        />
                      </div>
                    </details>
                  ))}
                </CardBody>
              </Card>
            );
          })}

          {!accounts.length ? (
            <Card>
              <CardBody>
                <p className="text-sm text-[var(--text-muted)]">
                  No accounts yet. Add the first one on the right.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader
            title="Add an account"
            description="An account with postings against it cannot change its kind, because that would move every figure ever posted to it to the other side of the statements."
          />
          <CardBody>
            <AccountForm parents={options} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
