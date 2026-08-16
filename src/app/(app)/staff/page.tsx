import type { Metadata } from "next";
import { BookOpen, TriangleAlert, UserCheck, UserPlus, Users } from "lucide-react";

import { Alert, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";

import { StaffTable, type StaffRow } from "./staff-table";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const user = await requirePermission("staff.read");

  const staff = await db.staff.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      staffNo: true,
      title: true,
      firstName: true,
      lastName: true,
      otherNames: true,
      photoUrl: true,
      gender: true,
      jobTitle: true,
      department: true,
      employmentType: true,
      status: true,
      email: true,
      phone: true,
      isTeaching: true,
      specialisations: true,
      hireDate: true,
      userId: true,
      campus: { select: { name: true } },
      formClasses: {
        take: 1,
        select: { name: true, classLevel: { select: { name: true } } },
      },
      _count: { select: { offerings: true } },
    },
  });

  const now = Date.now();

  const rows: StaffRow[] = staff.map((member) => ({
    id: member.id,
    staffNo: member.staffNo,
    name: fullName(member),
    photoUrl: member.photoUrl,
    jobTitle: member.jobTitle,
    department: member.department,
    employmentType: member.employmentType,
    status: member.status,
    gender: member.gender,
    email: member.email,
    phone: member.phone,
    campus: member.campus?.name ?? null,
    isTeaching: member.isTeaching,
    specialisations: member.specialisations,
    classesTaught: member._count.offerings,
    formClass: member.formClasses[0]
      ? `${member.formClasses[0].classLevel.name} ${member.formClasses[0].name}`
      : null,
    hireDate: member.hireDate?.toISOString() ?? null,
    yearsOfService: member.hireDate
      ? Math.floor((now - member.hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null,
    hasAccount: Boolean(member.userId),
  }));

  const active = rows.filter((row) => row.status === "ACTIVE").length;
  const teaching = rows.filter((row) => row.isTeaching && row.status === "ACTIVE");
  const withoutLogin = rows.filter(
    (row) => !row.hasAccount && row.status === "ACTIVE",
  ).length;
  const unassigned = teaching.filter((row) => row.classesTaught === 0).length;

  const averageLoad = teaching.length
    ? Math.round(
        (teaching.reduce((sum, row) => sum + row.classesTaught, 0) / teaching.length) *
          10,
      ) / 10
    : 0;

  return (
    <>
      <PageHeader
        title="Staff"
        description="Teaching and non-teaching records, contracts and teaching load."
        action={
          userCan(user, "staff.create") ? (
            <LinkButton href="/staff/new" size="sm">
              <UserPlus className="size-4" />
              Add staff
            </LinkButton>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Staff records"
          value={rows.length.toLocaleString()}
          tone="violet"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Active"
          value={active.toLocaleString()}
          hint={`${rows.length - active} on leave or exited`}
          tone="success"
          icon={<UserCheck className="size-4" />}
        />
        <StatCard
          label="Average teaching load"
          value={averageLoad}
          hint="Class–subject assignments per teacher"
          tone="info"
          icon={<BookOpen className="size-4" />}
        />
        <StatCard
          label="Teachers with no classes"
          value={unassigned}
          tone={unassigned ? "warning" : "success"}
          icon={<TriangleAlert className="size-4" />}
          hint="Marked as teaching but unassigned"
        />
      </div>

      {withoutLogin > 0 ? (
        <Alert tone="warning" className="mb-4">
          {withoutLogin} active staff member{withoutLogin === 1 ? " has" : "s have"} no
          user account, so they cannot sign in, take a register or enter marks. Open a
          staff profile to create the account — it links the login to the person.
        </Alert>
      ) : null}

      <StaffTable rows={rows} />
    </>
  );
}
