import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { ledgerAccounts } from "@/lib/ledger";

import { JournalEntryForm } from "../ledger-forms";

export const metadata: Metadata = { title: "New journal entry" };
export const dynamic = "force-dynamic";

export default async function NewJournalEntryPage() {
  const user = await requirePermission("finance.ledger.record");
  const accounts = await ledgerAccounts({ activeOnly: true });

  // Nothing can be written before there is somewhere to write it to, and a
  // form with an empty required dropdown is a dead end.
  if (!accounts.length) redirect("/finance/ledger/accounts?first=1");

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
        title="New journal entry"
        description="Something given and something received, in equal amounts."
      />

      <Card>
        <CardHeader
          title="The entry"
          description="Save it as a draft to come back to, or post it straight into the accounts. Nothing unbalanced is ever posted."
        />
        <JournalEntryForm
          accounts={accounts}
          canPost={userCan(user, "finance.ledger.post")}
        />
      </Card>
    </>
  );
}
