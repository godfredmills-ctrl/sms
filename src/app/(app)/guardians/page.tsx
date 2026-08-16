import type { Metadata } from "next";
import { Contact, MessageSquare, Users, Wallet } from "lucide-react";

import { Alert, PageHeader, StatCard } from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import { DOCUMENT_CATEGORIES } from "@/lib/person-documents";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { fullName } from "@/lib/utils";

import { AddGuardianButton } from "./add-guardian-button";
import { GuardiansTable, type GuardianRow } from "./guardians-table";

export const metadata: Metadata = { title: "Guardians" };
export const dynamic = "force-dynamic";

export default async function GuardiansPage() {
  const user = await requirePermission("student.read");
  const canSeeFinance = userCan(user, "finance.read");

  const guardians = await db.guardian.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      title: true,
      firstName: true,
      lastName: true,
      otherNames: true,
      photoUrl: true,
      phone: true,
      altPhone: true,
      email: true,
      occupation: true,
      employer: true,
      preferredChannel: true,
      city: true,
      isPtaMember: true,
      isAlumni: true,
      userId: true,
      students: {
        select: {
          relation: true,
          isPrimary: true,
          isBillPayer: true,
          isEmergency: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              otherNames: true,
              invoices: canSeeFinance
                ? {
                    where: {
                      balanceMinor: { gt: 0 },
                      status: { notIn: ["DRAFT", "CANCELLED"] },
                    },
                    select: { balanceMinor: true },
                  }
                : false,
            },
          },
        },
      },
    },
  });

  const rows: GuardianRow[] = guardians.map((guardian) => {
    const links = guardian.students;

    // A guardian's "outstanding" is what the children they actually pay for
    // owe — attributing every child's balance to every listed guardian would
    // double-count a bill two parents share.
    const outstandingMinor = canSeeFinance
      ? links
          .filter((link) => link.isBillPayer)
          .reduce(
            (sum, link) =>
              sum +
              (link.student.invoices || []).reduce(
                (inner, invoice) => inner + invoice.balanceMinor,
                0,
              ),
            0,
          )
      : 0;

    return {
      id: guardian.id,
      name: fullName(guardian),
      photoUrl: guardian.photoUrl,
      phone: guardian.phone,
      altPhone: guardian.altPhone,
      email: guardian.email,
      occupation: guardian.occupation,
      employer: guardian.employer,
      preferredChannel: guardian.preferredChannel,
      city: guardian.city,
      isPtaMember: guardian.isPtaMember,
      isAlumni: guardian.isAlumni,
      hasAccount: Boolean(guardian.userId),
      childCount: links.length,
      children: links.map((link) => fullName(link.student)),
      childIds: links.map((link) => link.student.id),
      relations: [...new Set(links.map((link) => link.relation))],
      isBillPayer: links.some((link) => link.isBillPayer),
      isEmergency: links.some((link) => link.isEmergency),
      outstandingMinor,
    };
  });

  const withoutLogin = rows.filter((row) => !row.hasAccount).length;
  const billPayers = rows.filter((row) => row.isBillPayer).length;
  const owing = rows.filter((row) => row.outstandingMinor > 0);
  const totalOwed = owing.reduce((sum, row) => sum + row.outstandingMinor, 0);
  const unlinked = rows.filter((row) => row.childCount === 0).length;

  return (
    <>
      <PageHeader
        title="Guardians"
        description="Parents and guardians, who they are responsible for, and how to reach them."
        action={
          <>
            <RefreshButton />
            {userCan(user, "student.guardian.manage") ? (
              <AddGuardianButton documentCategories={DOCUMENT_CATEGORIES.guardian} />
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Guardians"
          value={rows.length.toLocaleString()}
          tone="violet"
          icon={<Contact className="size-4" />}
        />
        <StatCard
          label="Bill payers"
          value={billPayers.toLocaleString()}
          hint="Receive invoices and reminders"
          tone="info"
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Portal accounts"
          value={(rows.length - withoutLogin).toLocaleString()}
          hint={`${withoutLogin} without a login`}
          tone={withoutLogin ? "warning" : "success"}
          icon={<Users className="size-4" />}
        />
        {canSeeFinance ? (
          <StatCard
            label="Owed by families"
            value={formatMoney(totalOwed)}
            hint={`${owing.length} guardians`}
            tone={totalOwed > 0 ? "danger" : "success"}
            icon={<MessageSquare className="size-4" />}
          />
        ) : (
          <StatCard
            label="PTA members"
            value={rows.filter((row) => row.isPtaMember).length}
            tone="teal"
          />
        )}
      </div>

      {unlinked > 0 ? (
        <Alert tone="warning" className="mb-4">
          {unlinked} guardian record{unlinked === 1 ? " is" : "s are"} not linked to any
          student. They will not receive announcements, reports or fee reminders until
          a child is attached from that student&rsquo;s Family tab.
        </Alert>
      ) : null}

      <GuardiansTable rows={rows} />
    </>
  );
}
