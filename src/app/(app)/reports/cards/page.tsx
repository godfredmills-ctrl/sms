import type { Metadata } from "next";
import { CheckCheck, FileText, Send } from "lucide-react";

import { Alert, Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { SearchableSelect } from "@/components/select-search";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { percentOf } from "@/lib/money";
import { toNumber } from "@/lib/utils";

import { publishReportCardsAction } from "./actions";
import { EmailCardsPanel } from "./email-panel";
import { ReportCardsTable, type ReportCardRow } from "./cards-table";
import { GeneratePanel } from "./generate-panel";

export const metadata: Metadata = { title: "Report Cards" };
export const dynamic = "force-dynamic";

export default async function ReportCardsPage() {
  const user = await requirePermission([
    "assessment.report.generate",
    "assessment.read",
  ]);

  const canGenerate = userCan(user, "assessment.report.generate");
  const canApprove = userCan(user, "assessment.report.approve");

  // A subject teacher sees the classes they teach; leadership sees all.
  const ownSectionIds = canApprove
    ? null
    : (
        await db.subjectOffering.findMany({
          where: { teacherId: user.staffId ?? "" },
          select: { classSectionId: true },
          distinct: ["classSectionId"],
        })
      ).map((offering) => offering.classSectionId);

  const [sections, terms, scales, cards] = await Promise.all([
    db.classSection.findMany({
      where: {
        isActive: true,
        ...(ownSectionIds ? { id: { in: ownSectionIds } } : {}),
      },
      orderBy: [{ classLevel: { sequence: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        classLevel: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
    }),
    db.term.findMany({
      orderBy: [{ academicYear: { startDate: "desc" } }, { sequence: "asc" }],
      select: {
        id: true,
        name: true,
        isCurrent: true,
        academicYear: { select: { name: true } },
      },
      take: 12,
    }),
    db.gradeScale.findMany({
      where: { isActive: true },
      select: { id: true, name: true, isDefault: true },
    }),
    db.reportCard.findMany({
      where: ownSectionIds ? { classSectionId: { in: ownSectionIds } } : {},
      orderBy: [{ createdAt: "desc" }],
      take: 800,
      select: {
        id: true,
        averageScore: true,
        overallGrade: true,
        positionInClass: true,
        classSize: true,
        daysPresent: true,
        totalSchoolDays: true,
        status: true,
        formTeacherRemark: true,
        term: { select: { name: true } },
        classSection: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
        student: {
          select: { firstName: true, lastName: true, admissionNo: true },
        },
      },
    }),
  ]);

  const rows: ReportCardRow[] = cards.map((card) => ({
    id: card.id,
    studentName: `${card.student.firstName} ${card.student.lastName}`,
    admissionNo: card.student.admissionNo,
    className: `${card.classSection.classLevel.name} ${card.classSection.name}`,
    term: card.term.name,
    average: toNumber(card.averageScore),
    overallGrade: card.overallGrade,
    position: card.positionInClass,
    classSize: card.classSize,
    attendanceRate:
      card.totalSchoolDays && card.daysPresent !== null
        ? percentOf(card.daysPresent, card.totalSchoolDays)
        : null,
    status: card.status,
    hasRemark: Boolean(card.formTeacherRemark),
  }));

  const currentTerm = terms.find((term) => term.isCurrent);
  const published = rows.filter((row) => row.status === "PUBLISHED").length;
  const missingRemarks = rows.filter(
    (row) => !row.hasRemark && row.status !== "PUBLISHED",
  ).length;

  return (
    <>
      <PageHeader
        title="Report Cards"
        description="Generate terminal reports, add remarks, then publish them to families."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Report cards"
          value={rows.length.toLocaleString()}
          tone="violet"
          icon={<FileText className="size-4" />}
        />
        <StatCard
          label="Published"
          value={published.toLocaleString()}
          tone={published ? "success" : "neutral"}
          icon={<Send className="size-4" />}
          hint="Visible to families"
        />
        <StatCard
          label="Awaiting remarks"
          value={missingRemarks.toLocaleString()}
          tone={missingRemarks ? "warning" : "success"}
          icon={<CheckCheck className="size-4" />}
        />
        <StatCard
          label="Classes"
          value={sections.length}
          tone="info"
          hint={currentTerm ? currentTerm.name : "No current term"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          {canGenerate ? (
            <Card>
              <CardHeader
                title="Generate"
                description="Builds a report card for every student in the class."
              />
              <GeneratePanel
                defaultTermId={currentTerm?.id}
                classes={sections.map((section) => ({
                  value: section.id,
                  label: `${section.classLevel.name} ${section.name}`,
                  description: `${section._count.enrollments} students`,
                }))}
                terms={terms.map((term) => ({
                  value: term.id,
                  label: `${term.academicYear.name} · ${term.name}`,
                  description: term.isCurrent ? "Current term" : undefined,
                }))}
                scales={scales.map((scale) => ({
                  value: scale.id,
                  label: scale.name,
                  description: scale.isDefault ? "School default" : undefined,
                }))}
              />
            </Card>
          ) : null}

          {canApprove && currentTerm ? (
            <Card>
              <CardHeader
                title="Publish a class"
                description="Makes results visible in the student and parent portals."
              />
              <form
                action={async (formData: FormData) => {
                  "use server";
                  // The action reports counts; a form action must resolve to void.
                  await publishReportCardsAction(formData);
                }}
                className="space-y-3 p-5"
              >
                <input type="hidden" name="termId" value={currentTerm.id} />
                <label className="block text-xs font-medium text-[var(--text-muted)]">
                  Class
                </label>
                <SearchableSelect
                  name="classSectionId"
                  required
                  placeholder="Choose a class…"
                  options={sections.map((section) => ({
                    value: section.id,
                    label: `${section.classLevel.name} ${section.name}`,
                    description: `${section._count.enrollments} students`,
                  }))}
                />
                <button
                  type="submit"
                  className="flex h-9.5 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] text-sm font-medium text-[var(--primary-text)]"
                >
                  <Send className="size-4" />
                  Publish and notify families
                </button>
                <p className="text-xs text-[var(--text-subtle)]">
                  Each family is notified about their own child only.
                </p>
              </form>
            </Card>
          ) : null}

          {canApprove && currentTerm ? (
            <Card>
              <CardHeader
                title="Email a class"
                description="Sends each published report card home as a PDF attachment."
              />
              <EmailCardsPanel
                termId={currentTerm.id}
                sections={sections.map((section) => ({
                  value: section.id,
                  label: `${section.classLevel.name} ${section.name}`,
                  description: `${section._count.enrollments} students`,
                }))}
              />
            </Card>
          ) : null}

          {missingRemarks > 0 ? (
            <Alert tone="warning" title="Remarks outstanding">
              {missingRemarks} report card{missingRemarks === 1 ? " has" : "s have"} no
              form teacher remark yet. Publishing without one leaves a blank space on
              the printed card.
            </Alert>
          ) : null}
        </div>

        <ReportCardsTable rows={rows} />
      </div>
    </>
  );
}
