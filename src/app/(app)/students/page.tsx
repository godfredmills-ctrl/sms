import type { Metadata } from "next";
import {
  AlertTriangle,
  FileUp,
  GraduationCap,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { LinkButton, PageHeader, StatCard } from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { DOCUMENT_CATEGORIES } from "@/lib/person-documents";
import { ownSectionIdsFor } from "@/lib/scope";
import { toNumber } from "@/lib/utils";

import { AdmitStudentButton } from "./admit-student-button";
import { StudentsTable, type StudentRow } from "./students-table";

export const metadata: Metadata = { title: "Students" };
export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const user = await requirePermission(["student.read", "student.read.own"]);

  // A subject teacher only sees students in classes they actually teach —
  // the shared "own classes" scope, so this list and the discipline desk can
  // never quietly mean different classes.
  const restrictToOwnClasses =
    !userCan(user, "student.read") && userCan(user, "student.read.own");

  const ownSectionIds = restrictToOwnClasses
    ? await ownSectionIdsFor(user.staffId)
    : [];

  const students = await db.student.findMany({
    where: restrictToOwnClasses
      ? { enrollments: { some: { classSectionId: { in: ownSectionIds } } } }
      : {},
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      otherNames: true,
      photoUrl: true,
      gender: true,
      dateOfBirth: true,
      status: true,
      isBoarder: true,
      house: true,
      nationality: true,
      admissionDate: true,
      learningSupport: true,
      enrollments: {
        where: { status: "ACTIVE" },
        take: 1,
        orderBy: { enrolledOn: "desc" },
        select: {
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
        },
      },
      guardians: {
        where: { isPrimary: true },
        take: 1,
        select: {
          guardian: { select: { firstName: true, lastName: true, phone: true } },
        },
      },
      invoices: {
        where: { balanceMinor: { gt: 0 }, status: { notIn: ["DRAFT", "CANCELLED"] } },
        select: { balanceMinor: true },
      },
      attendance: {
        select: { status: true },
      },
      scores: {
        where: { isAbsent: false, score: { not: null } },
        select: {
          score: true,
          assessment: { select: { maxScore: true } },
        },
      },
    },
  });

  const rows: StudentRow[] = students.map((student) => {
    const enrolment = student.enrollments[0];
    const guardian = student.guardians[0]?.guardian;

    const attendanceTotal = student.attendance.length;
    const attendancePresent = student.attendance.filter((record) =>
      ["PRESENT", "LATE", "EXCUSED", "HALF_DAY"].includes(record.status),
    ).length;

    const percentages = student.scores.map((score) => {
      const max = toNumber(score.assessment.maxScore) ?? 100;
      return ((toNumber(score.score) ?? 0) / max) * 100;
    });

    return {
      id: student.id,
      admissionNo: student.admissionNo,
      fullName: [student.firstName, student.otherNames, student.lastName]
        .filter(Boolean)
        .join(" "),
      photoUrl: student.photoUrl,
      gender: student.gender,
      dateOfBirth: student.dateOfBirth?.toISOString() ?? null,
      status: student.status,
      className: enrolment
        ? `${enrolment.classSection.classLevel.name} ${enrolment.classSection.name}`
        : "Unassigned",
      classLevel: enrolment?.classSection.classLevel.name ?? "Unassigned",
      house: student.house,
      boarding: student.isBoarder ? "Boarder" : "Day",
      nationality: student.nationality,
      guardianName: guardian ? `${guardian.firstName} ${guardian.lastName}` : null,
      guardianPhone: guardian?.phone ?? null,
      outstandingMinor: student.invoices.reduce(
        (sum, invoice) => sum + invoice.balanceMinor,
        0,
      ),
      attendanceRate: attendanceTotal
        ? Math.round((attendancePresent / attendanceTotal) * 1000) / 10
        : null,
      averageScore: percentages.length
        ? Math.round(
            (percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10,
          ) / 10
        : null,
      admissionDate: student.admissionDate?.toISOString() ?? null,
      learningSupport: student.learningSupport,
    };
  });

  const enrolled = rows.filter((row) => row.status === "ENROLLED").length;
  const withBalance = rows.filter((row) => row.outstandingMinor > 0).length;
  const atRisk = rows.filter(
    (row) => row.attendanceRate !== null && row.attendanceRate < 85,
  ).length;

  const canEdit = userCan(user, "student.update");
  const canTransfer = userCan(user, "academic.enrollment.manage");

  // Class options with room left shown alongside. One query serves both the
  // admission modal and the row controls: a second fetch of the same list is a
  // second answer to "which classes have space".
  const admissionSections =
    userCan(user, "student.create") || canEdit || canTransfer
    ? (
        await db.classSection.findMany({
          where: { isActive: true },
          orderBy: [{ classLevel: { sequence: "asc" } }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            capacity: true,
            classLevel: { select: { name: true } },
            _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
          },
        })
      ).map((section) => ({
        value: section.id,
        label: `${section.classLevel.name} ${section.name}`,
        description: `${section._count.enrollments}/${section.capacity} enrolled`,
      }))
    : [];

  return (
    <>
      <PageHeader
        title="Students"
        description={
          restrictToOwnClasses
            ? "Students in the classes you teach."
            : "Every student record in the school."
        }
        action={
          <>
            <RefreshButton />
            {userCan(user, "student.import") ? (
              <LinkButton href="/students/import" variant="outline" size="sm">
                <FileUp className="size-4" />
                Import
              </LinkButton>
            ) : null}
            {userCan(user, "student.create") ? (
              <AdmitStudentButton
                sections={admissionSections}
                documentCategories={DOCUMENT_CATEGORIES.student}
              />
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total records"
          value={rows.length.toLocaleString()}
          tone="violet"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Currently enrolled"
          value={enrolled.toLocaleString()}
          tone="success"
          icon={<GraduationCap className="size-4" />}
        />
        <StatCard
          label="With fee balance"
          value={withBalance.toLocaleString()}
          tone={withBalance ? "warning" : "success"}
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Attendance below 85%"
          value={atRisk.toLocaleString()}
          tone={atRisk ? "danger" : "success"}
          icon={<AlertTriangle className="size-4" />}
          hint="Flagged for pastoral follow-up"
        />
      </div>

      <StudentsTable
        rows={rows}
        can={{ edit: canEdit, status: canEdit, transfer: canTransfer }}
        sections={admissionSections}
      />
    </>
  );
}
