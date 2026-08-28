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

  // Deactivated guardians are listed too, marked, and filterable. This is the
  // register of who the school's families are, and leaving people off it is
  // how a member of staff comes to believe a record was deleted.
  const guardians = await db.guardian.findMany({
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
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
      isActive: true,
      deactivatedReason: true,

      // Carried so the edit panel opens filled in without a second query. It
      // is a few hundred rows of short strings, which is cheaper than the
      // round trip it saves on every correction.
      gender: true,
      whatsapp: true,
      address: true,
      digitalAddr: true,
      nationality: true,
      nationalId: true,
      jobTitle: true,
      workPhone: true,
      religion: true,
      notes: true,
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
      isActive: guardian.isActive,
      deactivatedReason: guardian.deactivatedReason,
      values: {
        id: guardian.id,
        title: guardian.title ?? "",
        firstName: guardian.firstName,
        lastName: guardian.lastName,
        otherNames: guardian.otherNames ?? "",
        gender: guardian.gender,
        email: guardian.email ?? "",
        phone: guardian.phone,
        altPhone: guardian.altPhone ?? "",
        whatsapp: guardian.whatsapp ?? "",
        address: guardian.address ?? "",
        digitalAddr: guardian.digitalAddr ?? "",
        city: guardian.city ?? "",
        nationality: guardian.nationality ?? "",
        nationalId: guardian.nationalId ?? "",
        occupation: guardian.occupation ?? "",
        employer: guardian.employer ?? "",
        jobTitle: guardian.jobTitle ?? "",
        workPhone: guardian.workPhone ?? "",
        religion: guardian.religion ?? "",
        preferredChannel: guardian.preferredChannel,
        notes: guardian.notes ?? "",
      },
    };
  });

  // Every count above the table is about the working list. A deactivated
  // guardian with no portal login is not a gap to chase, and counting them as
  // one sends somebody to create an account for a parent who has left.
  const active = rows.filter((row) => row.isActive);
  const deactivated = rows.length - active.length;

  const withoutLogin = active.filter((row) => !row.hasAccount).length;
  const billPayers = active.filter((row) => row.isBillPayer).length;
  const owing = rows.filter((row) => row.outstandingMinor > 0);
  const totalOwed = owing.reduce((sum, row) => sum + row.outstandingMinor, 0);
  const unlinked = active.filter((row) => row.childCount === 0).length;

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
          value={active.length.toLocaleString()}
          hint={deactivated ? `${deactivated} deactivated` : "All contactable"}
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
          value={(active.length - withoutLogin).toLocaleString()}
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
            value={active.filter((row) => row.isPtaMember).length}
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

      <GuardiansTable
        rows={rows}
        can={{ manage: userCan(user, "student.guardian.manage") }}
        documentCategories={DOCUMENT_CATEGORIES.guardian}
      />
    </>
  );
}
