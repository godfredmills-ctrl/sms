import "server-only";

import { userCan, type AuthUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { studentOutOfScope } from "@/lib/scope";
import { loadDocumentImage } from "@/lib/document-images";
import { renderReportCardPdf } from "@/lib/pdf";
import { env } from "@/lib/env";
import { formatDate, fullName, ordinal, toNumber } from "@/lib/utils";

/**
 * Report card PDFs.
 *
 * Unlike a certificate these are **not** cached to storage. A report card is
 * re-issued every term for every student — caching them would fill a bucket
 * with thousands of objects that are cheap to rebuild, and unlike a
 * certificate a report card is expected to change when a mark is corrected and
 * the card re-published. The record in the database is the authority; the PDF
 * is a rendering of it.
 */

export type ReportCardAccess =
  | { allowed: true; via: "staff" | "self" | "guardian" }
  | { allowed: false; reason: string };

export async function canAccessReportCard(
  user: AuthUser,
  card: { studentId: string; status: string },
): Promise<ReportCardAccess> {
  // "Staff" is not one thing. The office reads any card; a teacher reads the
  // cards of children they teach. Asking only for assessment.read — which
  // every teacher holds — made every child's report card, drafts included,
  // readable by every member of teaching staff who could guess an id.
  if (userCan(user, "assessment.read") || userCan(user, "assessment.report.generate")) {
    const outOfScope = await studentOutOfScope(user, card.studentId);
    if (!outOfScope) return { allowed: true, via: "staff" };
    return { allowed: false, reason: outOfScope };
  }

  // A family never sees a draft. A report card in progress carries marks that
  // have not been checked, and a parent reading one as final is exactly the
  // conversation the approval step exists to prevent.
  if (card.status !== "PUBLISHED") {
    return { allowed: false, reason: "This report card has not been published yet." };
  }

  if (user.studentId && user.studentId === card.studentId) {
    return { allowed: true, via: "self" };
  }

  if (user.guardianId) {
    const link = await db.studentGuardian.findUnique({
      where: {
        studentId_guardianId: {
          studentId: card.studentId,
          guardianId: user.guardianId,
        },
      },
      select: { receivesReports: true },
    });

    if (link?.receivesReports) return { allowed: true, via: "guardian" };
    if (link) {
      return {
        allowed: false,
        reason:
          "Your record is not marked as a recipient of academic reports for this student. The school office can change that.",
      };
    }
  }

  return { allowed: false, reason: "This report card is not yours to view." };
}

export async function buildReportCardPdf(id: string): Promise<Buffer | null> {
  const card = await db.reportCard.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          otherNames: true,
          admissionNo: true,
          gender: true,
        },
      },
      term: { select: { name: true, endDate: true } },
      academicYear: { select: { name: true } },
      classSection: {
        select: {
          name: true,
          classLevel: { select: { name: true } },
          formTeacher: { select: { title: true, firstName: true, lastName: true } },
        },
      },
      gradeScale: { select: { name: true } },
      lines: {
        orderBy: { sortKey: "asc" },
        include: { subject: { select: { name: true } } },
      },
    },
  });

  if (!card) return null;

  const school = await db.school.findFirst({
    select: {
      name: true,
      motto: true,
      addressLine1: true,
      city: true,
      phone: true,
      logoUrl: true,
    },
  });

  const crest = await loadDocumentImage(school?.logoUrl);

  const attendanceKnown =
    card.totalSchoolDays !== null && card.totalSchoolDays > 0;

  const meta = [
    { label: "Term", value: `${card.term.name}, ${card.academicYear.name}` },
    {
      label: "Position",
      value: card.positionInClass
        ? `${ordinal(card.positionInClass)} of ${card.classSize ?? "—"}`
        : "Not ranked",
    },
    {
      label: "Attendance",
      value: attendanceKnown
        ? `${card.daysPresent ?? 0} of ${card.totalSchoolDays} days`
        : "Not recorded",
    },
    ...(card.conduct ? [{ label: "Conduct", value: card.conduct }] : []),
    ...(card.gradeScale ? [{ label: "Grading", value: card.gradeScale.name }] : []),
    ...(card.nextTermBegins
      ? [{ label: "Next term begins", value: formatDate(card.nextTermBegins) }]
      : []),
  ];

  const summary = [
    {
      label: "Average",
      value: card.averageScore ? `${toNumber(card.averageScore)?.toFixed(1)}%` : "—",
    },
    { label: "Total", value: toNumber(card.totalScore)?.toFixed(0) ?? "—" },
    ...(card.overallGrade ? [{ label: "Grade", value: card.overallGrade }] : []),
    ...(card.aggregate !== null
      ? [{ label: "Aggregate", value: String(card.aggregate) }]
      : []),
    ...(card.gpa ? [{ label: "GPA", value: toNumber(card.gpa)?.toFixed(2) ?? "—" }] : []),
  ];

  return renderReportCardPdf({
    school: {
      name: school?.name ?? "School",
      address: [school?.addressLine1, school?.city, school?.phone]
        .filter(Boolean)
        .join(" · "),
      motto: school?.motto ?? undefined,
    },
    crest,
    heading: `TERMINAL REPORT — ${card.term.name.toUpperCase()}, ${card.academicYear.name}`,
    student: {
      name: fullName(card.student),
      admissionNo: card.student.admissionNo,
      className: `${card.classSection.classLevel.name} ${card.classSection.name}`,
      gender: card.student.gender,
    },
    meta,
    subjects: card.lines.map((line) => ({
      subject: line.subject.name,
      ca: toNumber(line.caScore)?.toFixed(1) ?? "—",
      exam: toNumber(line.examScore)?.toFixed(1) ?? "—",
      total: toNumber(line.totalScore)?.toFixed(1) ?? "—",
      grade: line.grade ?? "—",
      position: line.position ? ordinal(line.position) : "—",
      classAverage: toNumber(line.classAverage)?.toFixed(1) ?? "—",
      remark: line.remark ?? "",
    })),
    summary,
    remarks: [
      {
        label: "Form teacher's remark",
        // Only what the teacher actually wrote. The AI draft is a drafting
        // aid inside the review screen; printing it here put machine-written
        // words above a teacher's name on a document that goes home — while
        // the approver's screen showed the remark blank.
        body: card.formTeacherRemark ?? "",
        signatory: card.classSection.formTeacher
          ? fullName(card.classSection.formTeacher)
          : undefined,
      },
      {
        label: "Head teacher's remark",
        body: card.headTeacherRemark ?? "",
      },
    ],
    footer: `${card.student.admissionNo} · ${card.term.name} ${card.academicYear.name} · Generated ${formatDate(new Date())} from ${env.appUrl}${
      card.status === "PUBLISHED" ? "" : " · DRAFT — not for distribution"
    }`,
  });
}
