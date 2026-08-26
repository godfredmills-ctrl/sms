import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  PageHeader,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { journalEntry, ledgerAccounts } from "@/lib/ledger";
import { accountTypeLabel, checkEntry } from "@/lib/ledger-rules";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

import {
  DiscardDraftForm,
  JournalEntryForm,
  PostButton,
  ReverseForm,
} from "../ledger-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const entry = await journalEntry(id);
  return { title: entry ? entry.reference : "Journal entry" };
}

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("finance.ledger.read");
  const { id } = await params;

  const entry = await journalEntry(id);
  if (!entry) notFound();

  const mayRecord = userCan(user, "finance.ledger.record");
  const mayPost = userCan(user, "finance.ledger.post");

  const verdict = checkEntry(entry.lines);
  const isDraft = entry.status === "DRAFT";

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
        title={entry.reference}
        description={entry.narration}
        action={
          <Badge
            tone={
              entry.status === "POSTED"
                ? "success"
                : entry.status === "DRAFT"
                  ? "warning"
                  : "neutral"
            }
          >
            {entry.status === "POSTED" ? "Posted" : entry.status === "DRAFT" ? "Draft" : "Void"}
          </Badge>
        }
      />

      {entry.reversedBy ? (
        <Alert tone="warning" className="mb-4">
          This entry was reversed by{" "}
          <Link
            href={`/finance/ledger/${entry.reversedBy.id}`}
            className="font-medium underline"
          >
            {entry.reversedBy.reference}
          </Link>
          . It stays exactly as it is: it happened, and the statements printed
          while it stood were correct at the time.
        </Alert>
      ) : null}

      {entry.reverses ? (
        <Alert tone="info" className="mb-4">
          This is the reversal of{" "}
          <Link
            href={`/finance/ledger/${entry.reverses.id}`}
            className="font-medium underline"
          >
            {entry.reverses.reference}
          </Link>
          .
        </Alert>
      ) : null}

      {isDraft && !verdict.balanced ? (
        <Alert tone="warning" className="mb-4">
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              This draft cannot be posted yet. {verdict.problems.join(" ")}
            </span>
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {isDraft && mayRecord ? (
            <Card>
              <CardHeader
                title="The entry"
                description="A draft affects nothing until it is posted."
              />
              <JournalEntryForm
                accounts={await ledgerAccounts({ activeOnly: true })}
                canPost={mayPost}
                values={{
                  id: entry.id,
                  narration: entry.narration,
                  entryDate: entry.entryDate.toISOString().slice(0, 10),
                  lines: entry.lines.map((line) => ({
                    accountId: line.accountId,
                    debit: line.debitMinor ? (line.debitMinor / 100).toFixed(2) : "",
                    credit: line.creditMinor ? (line.creditMinor / 100).toFixed(2) : "",
                    memo: line.memo ?? "",
                  })),
                }}
              />
            </Card>
          ) : (
            <Card>
              <CardHeader title="The entry" />
              <CardBody className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                      <th className="px-3 py-2 font-medium">Account</th>
                      <th className="px-3 py-2 text-right font-medium">Debit</th>
                      <th className="px-3 py-2 text-right font-medium">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((line) => (
                      <tr
                        key={line.id}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="px-3 py-1.5">
                          <Link
                            href={`/finance/ledger/accounts/${line.accountId}`}
                            className="hover:text-[var(--primary)] hover:underline"
                          >
                            <span className="numeric text-[var(--text-subtle)]">
                              {line.account.code}
                            </span>{" "}
                            {line.account.name}
                          </Link>
                          <span className="block text-xs text-[var(--text-subtle)]">
                            {accountTypeLabel(line.account.type)}
                            {line.memo ? ` · ${line.memo}` : ""}
                          </span>
                        </td>
                        <td className="numeric px-3 py-1.5 text-right">
                          {line.debitMinor ? formatMoney(line.debitMinor) : ""}
                        </td>
                        <td className="numeric px-3 py-1.5 text-right">
                          {line.creditMinor ? formatMoney(line.creditMinor) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--border)] font-medium">
                      <td className="px-3 py-2 text-xs text-[var(--text-muted)]">Totals</td>
                      <td className="numeric px-3 py-2 text-right">
                        {formatMoney(verdict.debitMinor)}
                      </td>
                      <td className="numeric px-3 py-2 text-right">
                        {formatMoney(verdict.creditMinor)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="About this entry" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Date", value: formatDate(entry.entryDate, "long") },
                  { label: "Source", value: entry.source === "manual" ? "Written by hand" : entry.source },
                  { label: "Term", value: entry.term?.name ?? "Not set" },
                  { label: "Year", value: entry.academicYear?.name ?? "Not set" },
                  { label: "Written by", value: entry.createdByLabel ?? "Unknown" },
                  {
                    label: "Posted",
                    value: entry.postedAt
                      ? `${formatDate(entry.postedAt, "long")} by ${entry.postedByLabel ?? "unknown"}`
                      : "Not posted",
                  },
                ]}
              />
            </CardBody>
          </Card>

          {isDraft && mayPost && verdict.balanced ? (
            <Card>
              <CardHeader title="Post it" description="This puts it into the accounts." />
              <CardBody>
                <PostButton id={entry.id} />
              </CardBody>
            </Card>
          ) : null}

          {isDraft && mayRecord ? (
            <Card>
              <CardHeader
                title="Discard"
                description="Only a draft can be discarded. A posted entry is reversed."
              />
              <CardBody>
                <DiscardDraftForm id={entry.id} />
              </CardBody>
            </Card>
          ) : null}

          {entry.status === "POSTED" && !entry.reversedBy && mayPost ? (
            <Card>
              <CardHeader
                title="Reverse it"
                description="The only way a posted entry ever changes."
              />
              <CardBody>
                <ReverseForm id={entry.id} reference={entry.reference} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
