import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Banknote,
  BookOpen,
  CalendarCheck,
  FolderOpen,
  GraduationCap,
  Home,
  Pencil,
  Phone,
  ShieldAlert,
} from "lucide-react";

import { PersonDocuments } from "@/components/person-documents";
import { DOCUMENT_CATEGORIES, documentsFor } from "@/lib/person-documents";

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
  StatCard,
  StatusBadge,
} from "@/components/ui";

import { DeleteStaffCard, StaffAccountCard, StaffStatusCard } from "../profile-cards";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  calculateAge,
  detectMomoNetwork,
  formatDate,
  formatPhone,
  fullName,
  humanise,
} from "@/lib/utils";

type TabKey =
  | "overview"
  | "employment"
  | "teaching"
  | "documents"
  | "payroll"
  | "leave";

const TABS: Array<{
  key: TabKey;
  label: string;
  icon: typeof Home;
  permission?: string;
}> = [
  { key: "overview", label: "Overview", icon: Home },
  { key: "employment", label: "Employment", icon: ShieldAlert },
  { key: "teaching", label: "Teaching", icon: BookOpen },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "payroll", label: "Bank & payroll", icon: Banknote, permission: "staff.update" },
  { key: "leave", label: "Leave", icon: CalendarCheck, permission: "staff.leave.manage" },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const staff = await db.staff.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  return { title: staff ? `${staff.firstName} ${staff.lastName}` : "Staff" };
}

export const dynamic = "force-dynamic";

export default async function StaffProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePermission("staff.read");
  const { id } = await params;
  const { tab } = await searchParams;

  // Same reason as the student profile: the tab strip hides the link, not the
  // panel. ?tab=payroll showed a colleague's salary, bank account and SSNIT
  // number to any account with staff.read.
  const visibleTabs = TABS.filter(
    (entry) => !entry.permission || userCan(user, entry.permission),
  );
  const active = (visibleTabs.find((entry) => entry.key === tab)?.key ??
    "overview") as TabKey;

  const staff = await db.staff.findUnique({
    where: { id },
    include: {
      campus: { select: { name: true } },
      user: {
        select: {
          id: true,
          email: true,
          status: true,
          lastLoginAt: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      },
      formClasses: {
        select: {
          id: true,
          name: true,
          classLevel: { select: { name: true } },
          _count: { select: { enrollments: true } },
        },
      },
      offerings: {
        select: {
          id: true,
          subject: { select: { name: true, code: true } },
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
          term: { select: { name: true } },
          _count: { select: { assessments: true } },
        },
      },
      leaveRequests: { orderBy: { startDate: "desc" }, take: 20 },
      _count: { select: { takenAttendance: true, gradedScores: true } },
    },
  });

  if (!staff) notFound();

  // For the account card: staff logins get staff-portal roles.
  const staffRoles = staff.user
    ? []
    : await db.role.findMany({
        where: { portal: "STAFF" },
        orderBy: { rank: "asc" },
        select: { id: true, name: true },
      });

  const name = fullName(staff);
  const qualifications =
    (staff.qualifications as Array<{
      qualification?: string;
      institution?: string;
      year?: string | number;
      grade?: string;
    }> | null) ?? [];

  const yearsOfService = staff.hireDate
    ? Math.floor((Date.now() - staff.hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const leaveTaken = staff.leaveRequests
    .filter((request) => request.status === "APPROVED")
    .reduce((sum, request) => sum + request.days, 0);

  return (
    <>
      {/* Header */}
      <div className="mb-5">
        <div className="mb-1.5 text-xs text-[var(--text-subtle)]">
          <Link href="/staff" className="hover:text-[var(--text)]">
            Staff
          </Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={name} src={staff.photoUrl} size={56} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                {staff.title ? `${staff.title} ` : ""}
                {name}
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                {staff.jobTitle ?? "Staff member"}
                {staff.department ? ` · ${staff.department}` : ""} · {staff.staffNo}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {userCan(user, "staff.update") ? (
              <LinkButton href={`/staff/${staff.id}/edit`} variant="outline" size="sm">
                <Pencil className="size-3.5" />
                Edit record
              </LinkButton>
            ) : null}
            <StatusBadge status={staff.status} />
            <Badge tone={staff.isTeaching ? "info" : "neutral"}>
              {staff.isTeaching ? "Teaching" : "Non-teaching"}
            </Badge>
            <Badge tone="neutral">{humanise(staff.employmentType)}</Badge>
          </div>
        </div>
      </div>

      {!staff.user ? (
        <Alert tone="warning" className="mb-4">
          This staff member has no user account, so they cannot sign in, take a
          register or enter marks. Use the card on the Employment tab to create one.
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Classes taught"
          value={staff.offerings.length}
          tone="violet"
          icon={<BookOpen className="size-4" />}
        />
        <StatCard
          label="Registers taken"
          value={staff._count.takenAttendance.toLocaleString()}
          tone="info"
          icon={<CalendarCheck className="size-4" />}
        />
        <StatCard
          label="Marks entered"
          value={staff._count.gradedScores.toLocaleString()}
          tone="teal"
          icon={<GraduationCap className="size-4" />}
        />
        <StatCard
          label="Years of service"
          value={yearsOfService ?? "—"}
          hint={staff.hireDate ? `Joined ${formatDate(staff.hireDate)}` : "No hire date"}
          tone="success"
        />
      </div>

      {/* Tabs */}
      <div className="scrollbar-none mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border)] pb-px">
        {visibleTabs.map((entry) => {
          const isActive = entry.key === active;
          const Icon = entry.icon;
          return (
            <Link
              key={entry.key}
              href={`/staff/${staff.id}?tab=${entry.key}`}
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
            <CardHeader title="Personal" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Full name", value: name },
                  { label: "Staff number", value: staff.staffNo },
                  { label: "Gender", value: humanise(staff.gender) },
                  {
                    label: "Date of birth",
                    value: staff.dateOfBirth
                      ? `${formatDate(staff.dateOfBirth)} (${calculateAge(staff.dateOfBirth)})`
                      : "—",
                  },
                  { label: "Nationality", value: staff.nationality ?? "—" },
                  { label: "Marital status", value: humanise(staff.maritalStatus) || "—" },
                  { label: "Religion", value: staff.religion ?? "—" },
                  { label: "Blood group", value: staff.bloodGroup ?? "—" },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Contact" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Phone", value: formatPhone(staff.phone) },
                  { label: "Alternate phone", value: formatPhone(staff.altPhone) },
                  { label: "Email", value: staff.email ?? "—" },
                  { label: "Campus", value: staff.campus?.name ?? "—" },
                  { label: "Address", value: staff.address ?? "—", span: true },
                  { label: "Ghana Post GPS", value: staff.digitalAddr ?? "—" },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Emergency contact"
              description="Called first if something happens on site."
            />
            <CardBody>
              {staff.emergencyName ? (
                <DescriptionList
                  items={[
                    { label: "Name", value: staff.emergencyName },
                    { label: "Relationship", value: staff.emergencyRelation ?? "—" },
                    { label: "Phone", value: formatPhone(staff.emergencyPhone) },
                  ]}
                />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  No emergency contact recorded.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="System access" />
            <CardBody>
              {staff.user ? (
                <DescriptionList
                  items={[
                    { label: "Sign-in email", value: staff.user.email ?? "—" },
                    {
                      label: "Account status",
                      value: <StatusBadge status={staff.user.status} />,
                    },
                    {
                      label: "Roles",
                      value:
                        staff.user.roles.map((link) => link.role.name).join(", ") || "—",
                      span: true,
                    },
                    {
                      label: "Last signed in",
                      value: staff.user.lastLoginAt
                        ? formatDate(staff.user.lastLoginAt)
                        : "Never",
                    },
                  ]}
                />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No account.</p>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {active === "employment" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Appointment" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Job title", value: staff.jobTitle ?? "—" },
                  { label: "Department", value: staff.department ?? "—" },
                  { label: "Contract", value: humanise(staff.employmentType) },
                  { label: "Status", value: <StatusBadge status={staff.status} /> },
                  {
                    label: "Hired",
                    value: staff.hireDate ? formatDate(staff.hireDate) : "—",
                  },
                  {
                    label: "Confirmed",
                    value: staff.confirmDate ? formatDate(staff.confirmDate) : "—",
                  },
                  {
                    label: "Exited",
                    value: staff.exitDate ? formatDate(staff.exitDate) : "—",
                  },
                  { label: "Exit reason", value: staff.exitReason ?? "—" },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Statutory identifiers" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Ghana Card", value: staff.nationalId ?? "—" },
                  { label: "SSNIT", value: staff.ssnitNumber ?? "—" },
                  { label: "TIN", value: staff.tin ?? "—" },
                ]}
              />
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Qualifications" />
            {qualifications.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {qualifications.map((entry, index) => (
                  <li key={index} className="px-5 py-3">
                    <p className="text-sm font-medium">
                      {entry.qualification ?? "Qualification"}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {[entry.institution, entry.year, entry.grade]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No qualifications recorded"
                description="Add them to support inspection and accreditation records."
              />
            )}
          </Card>

          {userCan(user, "staff.update") ? (
            <StaffStatusCard
              staffId={staff.id}
              status={staff.status}
              exitDate={staff.exitDate?.toISOString().slice(0, 10) ?? ""}
              exitReason={staff.exitReason ?? ""}
            />
          ) : null}

          {!staff.user && userCan(user, "user.manage") ? (
            <StaffAccountCard
              staffId={staff.id}
              roles={staffRoles.map((role) => ({ value: role.id, label: role.name }))}
              suggestedEmail={staff.email ?? ""}
              suggestedPhone={staff.phone ?? ""}
            />
          ) : null}

          {userCan(user, "staff.delete") ? (
            <DeleteStaffCard
              staffId={staff.id}
              name={name}
              historyCount={
                staff._count.takenAttendance +
                staff._count.gradedScores +
                staff.offerings.length +
                staff.formClasses.length
              }
            />
          ) : null}
        </div>
      ) : null}

      {active === "teaching" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Subject assignments"
              description={`${staff.offerings.length} class–subject combination${
                staff.offerings.length === 1 ? "" : "s"
              }`}
            />
            {staff.offerings.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {staff.offerings.map((offering) => (
                  <li
                    key={offering.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {offering.subject.name}
                      </p>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {offering.classSection.classLevel.name}{" "}
                        {offering.classSection.name}
                        {offering.term ? ` · ${offering.term.name}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{offering.subject.code}</Badge>
                      <Link
                        href={`/gradebook/${offering.id}`}
                        className="inline-flex h-8 items-center rounded-lg border border-[var(--border-strong)] px-3 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                      >
                        Gradebook
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No classes assigned"
                description="Assign subjects under Classes & Subjects."
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Form classes" />
            {staff.formClasses.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {staff.formClasses.map((section) => (
                  <li
                    key={section.id}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <span>
                      {section.classLevel.name} {section.name}
                    </span>
                    <Badge tone="info">{section._count.enrollments} students</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Not a form teacher" />
            )}
          </Card>

          <Card>
            <CardHeader title="Specialisations" />
            <CardBody>
              {staff.specialisations.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {staff.specialisations.map((subject) => (
                    <Badge key={subject} tone="violet">
                      {subject}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">None recorded.</p>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {active === "documents" ? (
        <PersonDocuments
          kind="staff"
          personId={staff.id}
          personName={name}
          documents={await documentsFor("staff", staff.id)}
          categories={DOCUMENT_CATEGORIES.staff}
          canManage={userCan(user, "staff.update")}
          canVerify={userCan(user, "staff.update")}
        />
      ) : null}

      {active === "payroll" ? (
        <Card>
          <CardHeader
            title="Bank and mobile money"
            description="Used for salary payments and reimbursements."
          />
          <CardBody>
            <DescriptionList
              items={[
                { label: "Bank", value: staff.bankName ?? "—" },
                { label: "Branch", value: staff.bankBranch ?? "—" },
                { label: "Account number", value: staff.bankAccountNo ?? "—" },
                {
                  label: "Mobile money",
                  value: staff.momoNumber
                    ? `${formatPhone(staff.momoNumber)} (${
                        staff.momoNetwork ??
                        detectMomoNetwork(staff.momoNumber) ??
                        "unknown network"
                      })`
                    : "—",
                },
              ]}
            />
          </CardBody>
        </Card>
      ) : null}

      {active === "leave" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Requests" value={staff.leaveRequests.length} tone="info" />
            <StatCard label="Days approved" value={leaveTaken} tone="violet" />
            <StatCard
              label="Pending"
              value={
                staff.leaveRequests.filter((request) => request.status === "PENDING")
                  .length
              }
              tone="warning"
            />
          </div>

          <Card>
            <CardHeader title="Leave history" />
            {staff.leaveRequests.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {staff.leaveRequests.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{humanise(request.leaveType)}</p>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {formatDate(request.startDate)} – {formatDate(request.endDate)} ·{" "}
                        {request.days} day{request.days === 1 ? "" : "s"}
                      </p>
                      {request.reason ? (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {request.reason}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge status={request.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No leave recorded" />
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
