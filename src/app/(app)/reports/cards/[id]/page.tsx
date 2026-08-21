import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Download } from "lucide-react";

import { Badge, Button, Card, CardHeader, StatusBadge } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { isAiEnabled } from "@/lib/ai/client";
import { requirePermission, userCan } from "@/lib/auth";
import { studentOutOfScope } from "@/lib/scope";
import { db } from "@/lib/db";
import { formatScoreCell } from "@/lib/marks-math";
import { percentOf } from "@/lib/money";
import { calculateAge, formatDate, humanise, toNumber } from "@/lib/utils";

import { approveReportCardAction } from "../actions";
import { RemarkEditor } from "./remark-editor";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = await db.reportCard.findUnique({
    where: { id },
    select: {
      student: { select: { firstName: true, lastName: true } },
      term: { select: { name: true } },
    },
  });
  return {
    title: card
      ? `${card.student.firstName} ${card.student.lastName} · ${card.term.name}`
      : "Report card",
  };
}

export default async function ReportCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission([
    "assessment.read",
    "assessment.report.generate",
    "portal.results.view",
  ]);
  const { id } = await params;

  const card = await db.reportCard.findUnique({
    where: { id },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          otherNames: true,
          admissionNo: true,
          dateOfBirth: true,
          gender: true,
          photoUrl: true,
          userId: true,
          guardians: { select: { guardian: { select: { userId: true } } } },
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
      gradeScale: {
        select: {
          name: true,
          bands: { orderBy: { sortKey: "asc" } },
        },
      },
      lines: {
        orderBy: { sortKey: "asc" },
        include: { subject: { select: { name: true } } },
      },
    },
  });

  if (!card) notFound();

  // A family may only open their own child's card.
  const isOwnRecord =
    card.student.userId === user.id ||
    card.student.guardians.some((link) => link.guardian.userId === user.id);
  // "Staff" is not a scope. A teacher may open the cards of children they
  // teach; the office may open any. Anyone else needs it to be their own.
  const isStaff =
    user.portal === "STAFF" && !(await studentOutOfScope(user, card.studentId));
  if (!isStaff && !isOwnRecord) notFound();

  // Families never see a card before it is published.
  if (!isStaff && card.status !== "PUBLISHED") notFound();

  const school = await db.school.findFirst({
    select: {
      name: true,
      motto: true,
      logoUrl: true,
      addressLine1: true,
      city: true,
      phone: true,
      email: true,
    },
  });

  const canEdit =
    isStaff &&
    userCan(user, "assessment.report.generate") &&
    card.status !== "PUBLISHED";
  const canApprove = isStaff && userCan(user, "assessment.report.approve");

  const fullName = [card.student.firstName, card.student.otherNames, card.student.lastName]
    .filter(Boolean)
    .join(" ");

  const attendanceRate =
    card.totalSchoolDays && card.daysPresent !== null
      ? percentOf(card.daysPresent, card.totalSchoolDays)
      : null;

  return (
    <>
      {/* Controls — never printed. */}
      <div className="no-print mb-5">
        <Link
          href="/reports/cards"
          className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)]"
        >
          ← All report cards
        </Link>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{fullName}</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {card.academicYear.name} · {card.term.name} ·{" "}
              {card.classSection.classLevel.name} {card.classSection.name}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={card.status} />

            {canApprove && card.status !== "APPROVED" && card.status !== "PUBLISHED" ? (
              <form
                action={async () => {
                  "use server";
                  await approveReportCardAction(card.id);
                }}
              >
                <Button type="submit" variant="outline" size="sm">
                  <CheckCircle2 className="size-4" />
                  Approve
                </Button>
              </form>
            ) : null}

            <a
              href={`/api/report-cards/${card.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--bg-subtle)]"
            >
              <Download className="size-4" />
              PDF
            </a>

            <PrintButton />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* The card itself                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="print-page mx-auto max-w-[210mm] bg-[var(--bg-elevated)] p-6 text-[13px] shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start gap-4 border-b-2 border-[var(--text)] pb-3">
          {school?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.logoUrl} alt="" className="size-16 object-contain" />
          ) : null}
          <div className="min-w-0 flex-1 text-center">
            <h2 className="text-lg font-bold tracking-tight uppercase">
              {school?.name ?? "School"}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              {[school?.addressLine1, school?.city].filter(Boolean).join(", ")}
              {school?.phone ? ` · ${school.phone}` : ""}
            </p>
            {school?.motto ? (
              <p className="text-[11px] italic">{school.motto}</p>
            ) : null}
            <p className="mt-1.5 text-sm font-semibold uppercase">
              Terminal Report — {card.term.name}, {card.academicYear.name}
            </p>
          </div>
          {card.student.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.student.photoUrl}
              alt=""
              className="size-16 rounded object-cover"
            />
          ) : null}
        </header>

        {/* Identity */}
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          {[
            { label: "Name", value: fullName, span: true },
            { label: "Admission No.", value: card.student.admissionNo },
            {
              label: "Class",
              value: `${card.classSection.classLevel.name} ${card.classSection.name}`,
            },
            { label: "Gender", value: humanise(card.student.gender) },
            {
              label: "Age",
              value: calculateAge(card.student.dateOfBirth)?.toString() ?? "—",
            },
            {
              label: "Position",
              value: card.positionInClass
                ? `${card.positionInClass} of ${card.classSize}`
                : "—",
            },
            {
              label: "Attendance",
              value:
                attendanceRate === null
                  ? "—"
                  : `${card.daysPresent}/${card.totalSchoolDays} (${attendanceRate.toFixed(0)}%)`,
            },
          ].map((item) => (
            <div key={item.label} className={item.span ? "col-span-2" : ""}>
              <dt className="text-[10px] tracking-wide text-[var(--text-subtle)] uppercase">
                {item.label}
              </dt>
              <dd className="font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>

        {/* Subjects */}
        <table className="mt-4 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-[var(--text)]">
              <th className="py-1.5 text-left font-semibold">Subject</th>
              <th className="py-1.5 text-right font-semibold">CA</th>
              <th className="py-1.5 text-right font-semibold">Exam</th>
              <th className="py-1.5 text-right font-semibold">Total</th>
              <th className="py-1.5 text-center font-semibold">Grade</th>
              <th className="py-1.5 text-right font-semibold">Pos.</th>
              <th className="py-1.5 text-right font-semibold">Class avg</th>
              <th className="py-1.5 text-left font-semibold">Remark</th>
            </tr>
          </thead>
          <tbody>
            {card.lines.map((line) => (
              <tr key={line.id} className="border-b border-[var(--border)]">
                <td className="py-1">{line.subject.name}</td>
                <td className="numeric py-1 text-right">
                  {formatScoreCell(toNumber(line.caScore), { absent: line.caAbsent })}
                </td>
                <td className="numeric py-1 text-right">
                  {formatScoreCell(toNumber(line.examScore), { absent: line.examAbsent })}
                </td>
                <td className="numeric py-1 text-right font-semibold">
                  {toNumber(line.totalScore)?.toFixed(1) ?? "—"}
                </td>
                <td className="py-1 text-center font-medium">{line.grade ?? "—"}</td>
                <td className="numeric py-1 text-right">{line.position ?? "—"}</td>
                <td className="numeric py-1 text-right text-[var(--text-muted)]">
                  {toNumber(line.classAverage)?.toFixed(1) ?? "—"}
                </td>
                <td className="py-1 text-[11px]">{line.remark ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--text)] font-semibold">
              <td className="py-1.5">Overall</td>
              <td colSpan={2} />
              <td className="numeric py-1.5 text-right">
                {toNumber(card.averageScore)?.toFixed(1) ?? "—"}
              </td>
              <td className="py-1.5 text-center">{card.overallGrade ?? "—"}</td>
              <td colSpan={3} className="py-1.5 text-right text-[11px] font-normal">
                {card.gpa !== null ? `GPA ${toNumber(card.gpa)?.toFixed(2)}` : ""}
                {card.aggregate !== null ? ` · Aggregate ${card.aggregate}` : ""}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Conduct */}
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4 text-[11px]">
          {[
            { label: "Conduct", value: card.conduct },
            { label: "Attitude", value: card.attitude },
            { label: "Interest", value: card.interest },
            { label: "Activities", value: card.activities },
          ].map((item) => (
            <div key={item.label}>
              <span className="text-[var(--text-subtle)]">{item.label}: </span>
              <span className="font-medium">{item.value ?? "—"}</span>
            </div>
          ))}
        </div>

        {/* Remarks */}
        <div className="mt-4 space-y-2 text-[12px]">
          <div>
            <p className="text-[10px] tracking-wide text-[var(--text-subtle)] uppercase">
              Form teacher&apos;s remark
            </p>
            <p className="min-h-[2.2rem] border-b border-dotted border-[var(--border-strong)] pb-1">
              {card.formTeacherRemark ?? ""}
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--text-subtle)]">
              {card.classSection.formTeacher
                ? `${card.classSection.formTeacher.title ?? ""} ${card.classSection.formTeacher.firstName} ${card.classSection.formTeacher.lastName}`.trim()
                : ""}
            </p>
          </div>

          <div>
            <p className="text-[10px] tracking-wide text-[var(--text-subtle)] uppercase">
              Head teacher&apos;s remark
            </p>
            <p className="min-h-[2.2rem] border-b border-dotted border-[var(--border-strong)] pb-1">
              {card.headTeacherRemark ?? ""}
            </p>
          </div>
        </div>

        {/* Grading key */}
        {card.gradeScale ? (
          <div className="mt-4 border-t border-[var(--border)] pt-2">
            <p className="text-[10px] tracking-wide text-[var(--text-subtle)] uppercase">
              Grading key — {card.gradeScale.name}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
              {card.gradeScale.bands.map((band) => (
                <span key={band.id}>
                  <span className="font-semibold">{band.grade}</span>{" "}
                  {toNumber(band.minScore)}–{toNumber(band.maxScore)}
                  {band.remark ? ` ${band.remark}` : ""}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <footer className="mt-4 flex items-end justify-between border-t border-[var(--border)] pt-2 text-[10px] text-[var(--text-muted)]">
          <span>
            {card.nextTermBegins
              ? `Next term begins: ${formatDate(card.nextTermBegins, "long")}`
              : ""}
          </span>
          <span>Issued {formatDate(card.publishedAt ?? card.updatedAt)}</span>
        </footer>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Staff editor                                                        */}
      {/* ------------------------------------------------------------------ */}
      {canEdit ? (
        <Card className="no-print mx-auto mt-5 max-w-[210mm]">
          <CardHeader
            title="Remarks and conduct"
            description="These appear on the printed card. Save before publishing."
            action={
              card.aiRemark ? <Badge tone="primary">AI draft available</Badge> : null
            }
          />
          <div className="p-5">
            <RemarkEditor
              reportCardId={card.id}
              studentName={card.student.firstName}
              formTeacherRemark={card.formTeacherRemark}
              headTeacherRemark={card.headTeacherRemark}
              aiRemark={card.aiRemark}
              conduct={card.conduct}
              attitude={card.attitude}
              interest={card.interest}
              activities={card.activities}
              nextTermBegins={
                card.nextTermBegins?.toISOString().slice(0, 10) ?? null
              }
              canEditHeadRemark={canApprove}
              aiEnabled={isAiEnabled()}
            />
          </div>
        </Card>
      ) : null}
    </>
  );
}

