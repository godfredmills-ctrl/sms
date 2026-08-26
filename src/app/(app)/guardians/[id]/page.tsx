import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Briefcase,
  FolderOpen,
  Home,
  Pencil,
  Phone,
  Users,
  Wallet,
} from "lucide-react";

import { PersonDocuments } from "@/components/person-documents";
import {
  Alert,
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";

import {
  DeleteGuardianCard,
  GuardianAccountCard,
  LinkWardCard,
  UnlinkWardButton,
} from "../ward-cards";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { DOCUMENT_CATEGORIES, documentsFor } from "@/lib/person-documents";
import { formatDate, formatPhone, fullName, humanise } from "@/lib/utils";

type TabKey = "overview" | "children" | "documents";

const TABS: Array<{ key: TabKey; label: string; icon: typeof Home }> = [
  { key: "overview", label: "Overview", icon: Home },
  { key: "children", label: "Children", icon: Users },
  { key: "documents", label: "Documents", icon: FolderOpen },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const guardian = await db.guardian.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  return { title: guardian ? `${guardian.firstName} ${guardian.lastName}` : "Guardian" };
}

export const dynamic = "force-dynamic";

export default async function GuardianProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePermission("student.read");
  const { id } = await params;
  const { tab } = await searchParams;
  const active = (TABS.find((entry) => entry.key === tab)?.key ?? "overview") as TabKey;

  const canSeeFinance = userCan(user, "finance.read");
  const canManage = userCan(user, "student.guardian.manage");

  const guardian = await db.guardian.findUnique({
    where: { id },
    include: {
      user: {
        select: { email: true, status: true, lastLoginAt: true },
      },
      students: {
        orderBy: [{ isPrimary: "desc" }, { sortKey: "asc" }],
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              otherNames: true,
              admissionNo: true,
              photoUrl: true,
              status: true,
              enrollments: {
                where: { status: "ACTIVE" },
                take: 1,
                select: {
                  classSection: {
                    select: { name: true, classLevel: { select: { name: true } } },
                  },
                },
              },
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

  if (!guardian) notFound();

  const name = fullName(guardian);

  // For the link card and the delete guard, only fetched for someone who can
  // act on them.
  const [linkableStudents, paymentCount] = canManage
    ? await Promise.all([
        db.student.findMany({
          where: {
            status: "ENROLLED",
            guardians: { none: { guardianId: guardian.id } },
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 1500,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            otherNames: true,
            admissionNo: true,
          },
        }),
        db.payment.count({ where: { guardianId: guardian.id } }),
      ])
    : [[], 0];

  // Only the children this guardian actually pays for — attributing every
  // child's balance to every listed guardian double-counts a shared bill.
  const owed = canSeeFinance
    ? guardian.students
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

  return (
    <>
      <PageHeader
        title={name}
        description={[guardian.occupation, guardian.employer]
          .filter(Boolean)
          .join(" · ")}
        breadcrumb={
          <Link href="/guardians" className="hover:text-[var(--text)]">
            Guardians
          </Link>
        }
        action={
          <>
            {canManage ? (
              <LinkButton
                href={`/guardians/${guardian.id}/edit`}
                variant="outline"
                size="sm"
              >
                <Pencil className="size-3.5" />
                Edit record
              </LinkButton>
            ) : null}
            {guardian.isPtaMember ? <Badge tone="teal">PTA</Badge> : null}
            {guardian.isAlumni ? <Badge tone="violet">Alumni</Badge> : null}
            {guardian.user ? (
              <StatusBadge status={guardian.user.status} />
            ) : (
              <Badge tone="warning">No portal login</Badge>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar name={name} src={guardian.photoUrl} size={56} />
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Children"
            value={guardian.students.length}
            tone="violet"
            icon={<Users className="size-4" />}
          />
          <StatCard
            label="Prefers"
            value={humanise(guardian.preferredChannel)}
            tone="info"
            icon={<Phone className="size-4" />}
          />
          {canSeeFinance ? (
            <StatCard
              label="Owed"
              value={formatMoney(owed)}
              hint={
                guardian.students.some((link) => link.isBillPayer)
                  ? "Children they pay for"
                  : "Not a bill payer"
              }
              tone={owed > 0 ? "danger" : "success"}
              icon={<Wallet className="size-4" />}
            />
          ) : null}
          <StatCard
            label="Portal"
            value={guardian.user ? "Active" : "None"}
            hint={
              guardian.user?.lastLoginAt
                ? `Last seen ${formatDate(guardian.user.lastLoginAt)}`
                : undefined
            }
            tone={guardian.user ? "success" : "warning"}
          />
        </div>
      </div>

      {!guardian.user ? (
        <Alert tone="warning" className="mb-4">
          This guardian has no portal login, so they cannot see results, fee statements
          or announcements. Create one from the Children tab: it links the account to
          this record and their wards.
        </Alert>
      ) : null}

      <div className="scrollbar-none mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border)] pb-px">
        {TABS.map((entry) => {
          const isActive = entry.key === active;
          const Icon = entry.icon;
          return (
            <Link
              key={entry.key}
              href={`/guardians/${guardian.id}?tab=${entry.key}`}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                isActive
                  ? "border-[var(--primary)] font-medium text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              <Icon className="size-4" />
              {entry.label}
            </Link>
          );
        })}
      </div>

      {active === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Contact" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Phone", value: formatPhone(guardian.phone) },
                  { label: "Alternate", value: formatPhone(guardian.altPhone) },
                  { label: "WhatsApp", value: formatPhone(guardian.whatsapp) },
                  { label: "Email", value: guardian.email ?? "-" },
                  {
                    label: "Preferred channel",
                    value: humanise(guardian.preferredChannel),
                  },
                  { label: "Address", value: guardian.address ?? "-", span: true },
                  { label: "Ghana Post GPS", value: guardian.digitalAddr ?? "-" },
                  { label: "City", value: guardian.city ?? "-" },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Personal" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Full name", value: name },
                  { label: "Gender", value: humanise(guardian.gender) },
                  { label: "Nationality", value: guardian.nationality ?? "-" },
                  { label: "Ghana Card", value: guardian.nationalId ?? "-" },
                  { label: "Religion", value: guardian.religion ?? "-" },
                  {
                    label: "Education",
                    value: humanise(guardian.educationLevel) || "-",
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader
              title="Work"
              action={<Briefcase className="size-4 text-[var(--text-subtle)]" />}
            />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Occupation", value: guardian.occupation ?? "-" },
                  { label: "Job title", value: guardian.jobTitle ?? "-" },
                  { label: "Employer", value: guardian.employer ?? "-" },
                  { label: "Work phone", value: formatPhone(guardian.workPhone) },
                  {
                    label: "Work address",
                    value: guardian.workAddress ?? "-",
                    span: true,
                  },
                ]}
              />
              {guardian.notes ? (
                <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm text-[var(--text-muted)]">
                  {guardian.notes}
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {active === "children" ? (
        <Card>
          <CardHeader
            title="Children"
            description="What this guardian is responsible for, and what they receive."
          />
          {guardian.students.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {guardian.students.map((link) => {
                const section = link.student.enrollments[0]?.classSection;
                return (
                  <li
                    key={link.student.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        name={fullName(link.student)}
                        src={link.student.photoUrl}
                        size={34}
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/students/${link.student.id}`}
                          className="text-sm font-medium hover:text-[var(--primary)]"
                        >
                          {fullName(link.student)}
                        </Link>
                        <p className="text-xs text-[var(--text-subtle)]">
                          {link.student.admissionNo}
                          {section
                            ? ` · ${section.classLevel.name} ${section.name}`
                            : ""}{" "}
                          · {humanise(link.relation)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {link.isPrimary ? <Badge tone="primary">Primary</Badge> : null}
                      {link.isEmergency ? <Badge tone="danger">Emergency</Badge> : null}
                      {link.isBillPayer ? (
                        <Badge tone="warning">
                          Bill payer
                          {link.billSharePercent ? ` ${link.billSharePercent}%` : ""}
                        </Badge>
                      ) : null}
                      {link.receivesReports ? (
                        <Badge tone="success">Reports</Badge>
                      ) : null}
                      {link.canPickUp ? <Badge tone="neutral">Can collect</Badge> : null}
                      {canManage ? (
                        <UnlinkWardButton
                          guardianId={guardian.id}
                          studentId={link.student.id}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={<Users className="size-5" />}
              title="No children linked"
              description={
                canManage
                  ? "Use the card below to link one."
                  : "Link this guardian from a student's Family tab."
              }
            />
          )}
        </Card>
      ) : null}

      {active === "children" && canManage ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <LinkWardCard
            guardianId={guardian.id}
            students={linkableStudents.map((student) => ({
              value: student.id,
              label: fullName(student),
              description: student.admissionNo,
            }))}
          />

          <div className="space-y-4">
            {!guardian.user && userCan(user, "user.manage") ? (
              <GuardianAccountCard
                guardianId={guardian.id}
                suggestedEmail={guardian.email ?? ""}
                suggestedPhone={guardian.phone}
                hasWards={guardian.students.length > 0}
              />
            ) : null}

            <DeleteGuardianCard
              guardianId={guardian.id}
              name={name}
              wardCount={guardian.students.length}
              paymentCount={paymentCount}
            />
          </div>
        </div>
      ) : null}

      {active === "documents" ? (
        <PersonDocuments
          kind="guardian"
          personId={guardian.id}
          personName={name}
          documents={await documentsFor("guardian", guardian.id)}
          categories={DOCUMENT_CATEGORIES.guardian}
          canManage={userCan(user, "student.guardian.manage")}
          canVerify={userCan(user, "student.update")}
        />
      ) : null}
    </>
  );
}
