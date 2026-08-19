import type { AiInsightKind } from "@prisma/client";

import { db } from "@/lib/db";
import { taughtBy } from "@/lib/scope";
import { formatMoney } from "@/lib/money";
import { formatPercent, toNumber } from "@/lib/utils";

import {
  generateStructured,
  generateText,
  INSIGHT_SCHEMA,
  isAiEnabled,
  type InsightPayload,
} from "./client";

/**
 * Domain analytics powered by Claude. Each function gathers a compact,
 * factual snapshot from the database, asks Claude to interpret it, and stores
 * the result as an `AiInsight` so it can be re-read without re-billing.
 */

const SYSTEM_PROMPT = `You are the analytics advisor inside a school management system used by international schools in Ghana.

Context you can rely on:
- The academic calendar runs in three terms (or two semesters) per academic year.
- Grading uses configurable scales; WASSCE-style grades (A1-F9, lower aggregate is better) and IGCSE/IB scales all appear.
- Fees are in Ghana Cedis (GHS) and part payments are normal and expected — an outstanding balance mid-term is not automatically a crisis.
- Staff titles include Head Teacher, Form Teacher, Bursar, Registrar.

How to analyse:
- Work only from the data given. Never invent a number, a student, or a trend you cannot point to.
- Quote the specific figures that support each finding.
- Distinguish signal from noise: a class of 8 students moving 3 marks is not a trend.
- Be direct about problems, and equally direct about what is working.
- Recommendations must be things a school in Ghana can actually do this term — not generic advice.
- Never identify a student by name in a way that implies a diagnosis or a judgement about their family.

Write plainly. Short sentences. No filler, no restating the question back.`;

type PersistOptions = {
  kind: AiInsightKind;
  scope: string;
  scopeId?: string | null;
  createdById?: string | null;
  /** Insights go stale — default to one week. */
  ttlHours?: number;
};

async function runInsight(
  prompt: string,
  inputData: unknown,
  persist: PersistOptions,
): Promise<InsightPayload | null> {
  const result = await generateStructured<InsightPayload>({
    system: SYSTEM_PROMPT,
    prompt,
    schema: INSIGHT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 8000,
    effort: "high",
  });

  if (!result) return null;

  await db.aiInsight
    .create({
      data: {
        kind: persist.kind,
        scope: persist.scope,
        scopeId: persist.scopeId ?? null,
        title: result.data.title,
        narrative: result.data.narrative,
        findings: result.data.findings,
        actions: result.data.actions,
        inputData: inputData as never,
        model: result.model,
        promptTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        expiresAt: new Date(Date.now() + (persist.ttlHours ?? 168) * 3600_000),
        createdById: persist.createdById ?? null,
      },
    })
    .catch((error) => {
      console.error("[ai] failed to persist insight", error);
    });

  return result.data;
}

/** Returns a cached insight when one is still fresh, to avoid re-billing. */
export async function getCachedInsight(kind: AiInsightKind, scopeId: string | null) {
  return db.aiInsight.findFirst({
    where: {
      kind,
      scopeId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
}

// -----------------------------------------------------------------------------
// Student progress — shown on the student profile and the guardian portal
// -----------------------------------------------------------------------------

export async function buildStudentSnapshot(studentId: string, termId: string) {
  const [student, scores, attendance, previousReports] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId },
      select: {
        firstName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        isBoarder: true,
        learningSupport: true,
        hasSpecialNeeds: true,
        enrollments: {
          orderBy: { enrolledOn: "desc" },
          take: 1,
          select: {
            classSection: { select: { name: true, classLevel: { select: { name: true } } } },
          },
        },
      },
    }),
    db.assessmentScore.findMany({
      where: { studentId, assessment: { termId } },
      select: {
        score: true,
        isAbsent: true,
        assessment: {
          select: {
            title: true,
            category: true,
            maxScore: true,
            isExam: true,
            conductedOn: true,
            offering: { select: { subject: { select: { name: true } } } },
          },
        },
      },
      orderBy: { gradedAt: "asc" },
    }),
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { studentId, session: { termId } },
      _count: { _all: true },
    }),
    db.reportCard.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        averageScore: true,
        positionInClass: true,
        classSize: true,
        term: { select: { name: true } },
        lines: {
          select: {
            totalScore: true,
            grade: true,
            subject: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  if (!student) return null;

  // Per-subject aggregation, expressed as percentages so subjects with
  // different max scores are comparable.
  const bySubject = new Map<string, { total: number; count: number; latest: number | null }>();
  for (const row of scores) {
    if (row.isAbsent || row.score === null) continue;
    const max = toNumber(row.assessment.maxScore) ?? 100;
    const pct = ((toNumber(row.score) ?? 0) / max) * 100;
    const name = row.assessment.offering.subject.name;
    const entry = bySubject.get(name) ?? { total: 0, count: 0, latest: null };
    entry.total += pct;
    entry.count += 1;
    entry.latest = pct;
    bySubject.set(name, entry);
  }

  const attendanceCounts = Object.fromEntries(
    attendance.map((row) => [row.status, row._count._all]),
  );
  const totalSessions = attendance.reduce((sum, row) => sum + row._count._all, 0);

  return {
    student: {
      name: `${student.firstName} ${student.lastName}`,
      class:
        student.enrollments[0]?.classSection.classLevel.name +
        " " +
        (student.enrollments[0]?.classSection.name ?? ""),
      isBoarder: student.isBoarder,
      learningSupport: student.learningSupport,
      hasSpecialNeeds: student.hasSpecialNeeds,
    },
    subjects: Array.from(bySubject.entries()).map(([name, value]) => ({
      subject: name,
      averagePercent: Math.round((value.total / value.count) * 10) / 10,
      assessmentsTaken: value.count,
      mostRecentPercent: value.latest === null ? null : Math.round(value.latest * 10) / 10,
    })),
    attendance: {
      totalSessions,
      ...attendanceCounts,
      attendanceRate:
        totalSessions > 0
          ? Math.round(((attendanceCounts.PRESENT ?? 0) / totalSessions) * 1000) / 10
          : null,
    },
    history: previousReports.map((report) => ({
      term: report.term.name,
      average: toNumber(report.averageScore),
      position: report.positionInClass,
      classSize: report.classSize,
      subjects: report.lines.map((line) => ({
        subject: line.subject.name,
        score: toNumber(line.totalScore),
        grade: line.grade,
      })),
    })),
  };
}

export async function generateStudentProgressInsight(
  studentId: string,
  termId: string,
  createdById?: string,
): Promise<InsightPayload | null> {
  if (!isAiEnabled()) return null;
  const snapshot = await buildStudentSnapshot(studentId, termId);
  if (!snapshot) return null;

  const prompt = `Analyse this student's progress this term and produce an insight for their form teacher and guardians.

Focus on:
1. Which subjects are improving, holding steady, or slipping — compared with the earlier terms in the history.
2. Whether attendance is affecting attainment.
3. Two or three specific interventions that would move the needle for THIS student.

Data:
${JSON.stringify(snapshot, null, 2)}`;

  return runInsight(prompt, snapshot, {
    kind: "STUDENT_PROGRESS",
    scope: "student",
    scopeId: studentId,
    createdById,
    ttlHours: 72,
  });
}

// -----------------------------------------------------------------------------
// Class / teaching analytics — "what's working and what isn't"
// -----------------------------------------------------------------------------

export async function buildTeachingSnapshot(teacherId: string, termId: string) {
  const offerings = await db.subjectOffering.findMany({
    where: { ...taughtBy(teacherId), termId },
    select: {
      id: true,
      subject: { select: { name: true, passMark: true } },
      classSection: {
        select: {
          name: true,
          classLevel: { select: { name: true } },
          _count: { select: { enrollments: true } },
        },
      },
      assessments: {
        select: {
          title: true,
          category: true,
          maxScore: true,
          isExam: true,
          conductedOn: true,
          scores: { select: { score: true, isAbsent: true, studentId: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return offerings.map((offering) => {
    const assessments = offering.assessments.map((assessment) => {
      const max = toNumber(assessment.maxScore) ?? 100;
      const marks = assessment.scores
        .filter((score) => !score.isAbsent && score.score !== null)
        .map((score) => ((toNumber(score.score) ?? 0) / max) * 100);

      const mean = marks.length
        ? marks.reduce((sum, value) => sum + value, 0) / marks.length
        : null;
      const sorted = [...marks].sort((a, b) => a - b);
      const passMark = offering.subject.passMark;

      return {
        title: assessment.title,
        category: assessment.category,
        isExam: assessment.isExam,
        conductedOn: assessment.conductedOn?.toISOString().slice(0, 10) ?? null,
        submitted: marks.length,
        absent: assessment.scores.filter((score) => score.isAbsent).length,
        meanPercent: mean === null ? null : Math.round(mean * 10) / 10,
        medianPercent: sorted.length
          ? Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10
          : null,
        lowestPercent: sorted.length ? Math.round(sorted[0] * 10) / 10 : null,
        highestPercent: sorted.length
          ? Math.round(sorted[sorted.length - 1] * 10) / 10
          : null,
        passRate: marks.length
          ? Math.round((marks.filter((m) => m >= passMark).length / marks.length) * 1000) / 10
          : null,
        /** How spread out the class is — a wide spread means differentiation is needed. */
        spread: sorted.length
          ? Math.round((sorted[sorted.length - 1] - sorted[0]) * 10) / 10
          : null,
      };
    });

    return {
      subject: offering.subject.name,
      class: `${offering.classSection.classLevel.name} ${offering.classSection.name}`,
      classSize: offering.classSection._count.enrollments,
      passMark: offering.subject.passMark,
      assessments,
    };
  });
}

export async function generateTeachingInsight(
  teacherId: string,
  termId: string,
  createdById?: string,
): Promise<InsightPayload | null> {
  if (!isAiEnabled()) return null;
  const snapshot = await buildTeachingSnapshot(teacherId, termId);
  if (!snapshot.length) return null;

  const prompt = `You are advising a teacher on their own classes this term. Tell them what is working, what is not, and how to improve.

Read the sequence of assessments in each class as a trajectory, not a set of isolated results. Pay attention to:
- Assessments where the class mean dropped sharply — that usually points at a topic that did not land.
- A wide spread between highest and lowest, which points at a need for differentiation rather than re-teaching.
- Pass rates below the subject pass mark.
- Classes where results are strong, so the teacher knows what to keep doing.

Be concrete about teaching moves: which topic to revisit, which group to pull aside, what to change about assessment design.

Data:
${JSON.stringify(snapshot, null, 2)}`;

  return runInsight(prompt, snapshot, {
    kind: "TEACHING_EFFECTIVENESS",
    scope: "teacher",
    scopeId: teacherId,
    createdById,
    ttlHours: 72,
  });
}

export async function generateClassInsight(
  classSectionId: string,
  termId: string,
  createdById?: string,
): Promise<InsightPayload | null> {
  if (!isAiEnabled()) return null;

  const [section, scores, attendance] = await Promise.all([
    db.classSection.findUnique({
      where: { id: classSectionId },
      select: {
        name: true,
        classLevel: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
    }),
    db.assessmentScore.findMany({
      where: {
        assessment: { termId, offering: { classSectionId } },
        isAbsent: false,
      },
      select: {
        score: true,
        assessment: {
          select: {
            maxScore: true,
            offering: { select: { subject: { select: { name: true } } } },
          },
        },
      },
    }),
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: { session: { classSectionId, termId } },
      _count: { _all: true },
    }),
  ]);

  if (!section) return null;

  const bySubject = new Map<string, number[]>();
  for (const row of scores) {
    const max = toNumber(row.assessment.maxScore) ?? 100;
    const pct = ((toNumber(row.score) ?? 0) / max) * 100;
    const name = row.assessment.offering.subject.name;
    bySubject.set(name, [...(bySubject.get(name) ?? []), pct]);
  }

  const snapshot = {
    class: `${section.classLevel.name} ${section.name}`,
    classSize: section._count.enrollments,
    subjects: Array.from(bySubject.entries()).map(([subject, values]) => ({
      subject,
      averagePercent:
        Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      sampleSize: values.length,
    })),
    attendance: Object.fromEntries(attendance.map((row) => [row.status, row._count._all])),
  };

  const prompt = `Analyse this class's performance across subjects this term for the form teacher and head of school.

Identify the subjects where this class is strongest and weakest relative to its own average, and say what that pattern suggests. Comment on whether attendance is a factor.

Data:
${JSON.stringify(snapshot, null, 2)}`;

  return runInsight(prompt, snapshot, {
    kind: "CLASS_PERFORMANCE",
    scope: "class",
    scopeId: classSectionId,
    createdById,
    ttlHours: 72,
  });
}

// -----------------------------------------------------------------------------
// Management brief — the school-wide view
// -----------------------------------------------------------------------------

export async function buildManagementSnapshot() {
  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    include: { terms: { where: { isCurrent: true }, take: 1 } },
  });
  const term = year?.terms[0];

  const [
    studentCount,
    staffCount,
    newAdmissions,
    invoiceTotals,
    attendanceBreakdown,
    subjectAverages,
    overdueCount,
  ] = await Promise.all([
    db.student.count({ where: { status: "ENROLLED" } }),
    db.staff.count({ where: { status: "ACTIVE" } }),
    db.student.count({
      where: {
        admissionDate: year ? { gte: year.startDate } : undefined,
      },
    }),
    db.invoice.aggregate({
      where: { academicYearId: year?.id, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { totalMinor: true, paidMinor: true, balanceMinor: true },
      _count: { _all: true },
    }),
    term
      ? db.attendanceRecord.groupBy({
          by: ["status"],
          where: { session: { termId: term.id } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    term
      ? db.assessmentScore.findMany({
          where: { assessment: { termId: term.id }, isAbsent: false },
          select: {
            score: true,
            assessment: {
              select: {
                maxScore: true,
                offering: { select: { subject: { select: { name: true } } } },
              },
            },
          },
        })
      : Promise.resolve([]),
    db.invoice.count({
      where: { status: { in: ["ISSUED", "PART_PAID", "OVERDUE"] }, dueDate: { lt: new Date() } },
    }),
  ]);

  const bySubject = new Map<string, number[]>();
  for (const row of subjectAverages) {
    const max = toNumber(row.assessment.maxScore) ?? 100;
    const name = row.assessment.offering.subject.name;
    bySubject.set(name, [
      ...(bySubject.get(name) ?? []),
      ((toNumber(row.score) ?? 0) / max) * 100,
    ]);
  }

  const totalAttendance = attendanceBreakdown.reduce(
    (sum, row) => sum + row._count._all,
    0,
  );
  const present =
    attendanceBreakdown.find((row) => row.status === "PRESENT")?._count._all ?? 0;

  return {
    academicYear: year?.name ?? "Not set",
    term: term?.name ?? "Not set",
    enrolment: {
      activeStudents: studentCount,
      activeStaff: staffCount,
      newAdmissionsThisYear: newAdmissions,
      studentTeacherRatio: staffCount ? Math.round((studentCount / staffCount) * 10) / 10 : null,
    },
    finance: {
      invoicesIssued: invoiceTotals._count._all,
      billedGhs: formatMoney(invoiceTotals._sum.totalMinor ?? 0, "GHS", { withSymbol: false }),
      collectedGhs: formatMoney(invoiceTotals._sum.paidMinor ?? 0, "GHS", { withSymbol: false }),
      outstandingGhs: formatMoney(
        invoiceTotals._sum.balanceMinor ?? 0,
        "GHS",
        { withSymbol: false },
      ),
      collectionRate: invoiceTotals._sum.totalMinor
        ? formatPercent(
            ((invoiceTotals._sum.paidMinor ?? 0) / invoiceTotals._sum.totalMinor) * 100,
          )
        : null,
      overdueInvoices: overdueCount,
    },
    attendance: {
      sessionsRecorded: totalAttendance,
      attendanceRate:
        totalAttendance > 0 ? Math.round((present / totalAttendance) * 1000) / 10 : null,
      breakdown: Object.fromEntries(
        attendanceBreakdown.map((row) => [row.status, row._count._all]),
      ),
    },
    academics: {
      subjectAverages: Array.from(bySubject.entries())
        .map(([subject, values]) => ({
          subject,
          averagePercent:
            Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
          sampleSize: values.length,
        }))
        .sort((a, b) => a.averagePercent - b.averagePercent),
    },
  };
}

export async function generateManagementBrief(
  createdById?: string,
): Promise<InsightPayload | null> {
  if (!isAiEnabled()) return null;
  const snapshot = await buildManagementSnapshot();

  const prompt = `Write the management brief for the school's leadership team (Head Teacher, Bursar, Board).

Cover, in this order of importance:
1. Anything that needs a decision this week.
2. Fee collection health — read the collection rate and overdue count together, and remember part payment is normal here.
3. Academic standing — which subjects sit well below the school average and what that implies about staffing or resources.
4. Attendance.
5. Enrolment and staffing ratio.

Data:
${JSON.stringify(snapshot, null, 2)}`;

  return runInsight(prompt, snapshot, {
    kind: "MANAGEMENT_BRIEF",
    scope: "school",
    scopeId: null,
    createdById,
    ttlHours: 24,
  });
}

// -----------------------------------------------------------------------------
// Fee / finance analytics
// -----------------------------------------------------------------------------

export async function generateFinanceInsight(
  createdById?: string,
): Promise<InsightPayload | null> {
  if (!isAiEnabled()) return null;

  const [byStatus, byChannel, ageing, topDebtors] = await Promise.all([
    db.invoice.groupBy({
      by: ["status"],
      _sum: { totalMinor: true, paidMinor: true, balanceMinor: true },
      _count: { _all: true },
    }),
    db.payment.groupBy({
      by: ["channel"],
      where: { status: "SUCCESS" },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
    db.invoice.findMany({
      where: { balanceMinor: { gt: 0 }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { dueDate: true, balanceMinor: true },
    }),
    db.invoice.groupBy({
      by: ["studentId"],
      where: { balanceMinor: { gt: 0 }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { balanceMinor: true },
      orderBy: { _sum: { balanceMinor: "desc" } },
      take: 10,
    }),
  ]);

  const now = Date.now();
  const buckets = { current: 0, days30: 0, days60: 0, days90plus: 0 };
  for (const invoice of ageing) {
    const overdueDays = invoice.dueDate
      ? Math.floor((now - invoice.dueDate.getTime()) / 86_400_000)
      : 0;
    if (overdueDays <= 0) buckets.current += invoice.balanceMinor;
    else if (overdueDays <= 30) buckets.days30 += invoice.balanceMinor;
    else if (overdueDays <= 60) buckets.days60 += invoice.balanceMinor;
    else buckets.days90plus += invoice.balanceMinor;
  }

  const snapshot = {
    invoicesByStatus: byStatus.map((row) => ({
      status: row.status,
      count: row._count._all,
      billedGhs: formatMoney(row._sum.totalMinor ?? 0, "GHS", { withSymbol: false }),
      outstandingGhs: formatMoney(row._sum.balanceMinor ?? 0, "GHS", { withSymbol: false }),
    })),
    paymentsByChannel: byChannel.map((row) => ({
      channel: row.channel,
      transactions: row._count._all,
      valueGhs: formatMoney(row._sum.amountMinor ?? 0, "GHS", { withSymbol: false }),
    })),
    receivablesAgeing: {
      notYetDueGhs: formatMoney(buckets.current, "GHS", { withSymbol: false }),
      overdue1to30Ghs: formatMoney(buckets.days30, "GHS", { withSymbol: false }),
      overdue31to60Ghs: formatMoney(buckets.days60, "GHS", { withSymbol: false }),
      overdue60plusGhs: formatMoney(buckets.days90plus, "GHS", { withSymbol: false }),
    },
    concentrationRisk: {
      topTenDebtorsGhs: formatMoney(
        topDebtors.reduce((sum, row) => sum + (row._sum.balanceMinor ?? 0), 0),
        "GHS",
        { withSymbol: false },
      ),
    },
  };

  const prompt = `Analyse the school's fee position for the Bursar.

Give a clear read on collection health, where the risk is concentrated in the ageing buckets, and which payment channels parents actually use (this should inform where to push reminders). Recommend a collection plan for the next 30 days that is firm but realistic for a Ghanaian school — many families pay in instalments.

Data:
${JSON.stringify(snapshot, null, 2)}`;

  return runInsight(prompt, snapshot, {
    kind: "FINANCE_HEALTH",
    scope: "finance",
    scopeId: null,
    createdById,
    ttlHours: 24,
  });
}

// -----------------------------------------------------------------------------
// At-risk scan — the early warning system
// -----------------------------------------------------------------------------

export async function generateAtRiskScan(
  termId: string,
  createdById?: string,
): Promise<InsightPayload | null> {
  if (!isAiEnabled()) return null;

  const students = await db.student.findMany({
    where: { status: "ENROLLED" },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      attendance: {
        where: { session: { termId } },
        select: { status: true },
      },
      scores: {
        where: { assessment: { termId }, isAbsent: false },
        select: { score: true, assessment: { select: { maxScore: true } } },
      },
      invoices: {
        where: { balanceMinor: { gt: 0 } },
        select: { balanceMinor: true },
      },
    },
    take: 500,
  });

  const flagged = students
    .map((student) => {
      const total = student.attendance.length;
      const absent = student.attendance.filter(
        (record) => record.status === "ABSENT",
      ).length;
      const attendanceRate = total ? ((total - absent) / total) * 100 : null;

      const percentages = student.scores.map((score) => {
        const max = toNumber(score.assessment.maxScore) ?? 100;
        return ((toNumber(score.score) ?? 0) / max) * 100;
      });
      const average = percentages.length
        ? percentages.reduce((a, b) => a + b, 0) / percentages.length
        : null;

      const outstanding = student.invoices.reduce(
        (sum, invoice) => sum + invoice.balanceMinor,
        0,
      );

      return {
        admissionNo: student.admissionNo,
        name: `${student.firstName} ${student.lastName}`,
        attendanceRate: attendanceRate === null ? null : Math.round(attendanceRate * 10) / 10,
        averagePercent: average === null ? null : Math.round(average * 10) / 10,
        assessmentsTaken: percentages.length,
        outstandingGhs: formatMoney(outstanding, "GHS", { withSymbol: false }),
      };
    })
    // Only send the model students who actually look at risk — this keeps the
    // prompt small and the analysis focused.
    .filter(
      (row) =>
        (row.attendanceRate !== null && row.attendanceRate < 85) ||
        (row.averagePercent !== null && row.averagePercent < 45),
    )
    .slice(0, 60);

  if (!flagged.length) return null;

  const prompt = `These students have been flagged by a rules-based screen (attendance below 85% or average below 45%). Review them and produce a triage for the pastoral team.

Group them by the kind of problem they have — attendance-driven, attainment-driven, or both — and say which ones need intervention first and what that intervention should be. Where a fee balance coincides with poor attendance, note it as a possible cause but do not assert it.

Data:
${JSON.stringify(flagged, null, 2)}`;

  return runInsight(prompt, flagged, {
    kind: "AT_RISK_SCAN",
    scope: "school",
    scopeId: termId,
    createdById,
    ttlHours: 48,
  });
}

// -----------------------------------------------------------------------------
// Report-card remarks
// -----------------------------------------------------------------------------

/**
 * Drafts a form teacher's remark. Deliberately returns plain text for the
 * teacher to edit — the draft is stored in `aiRemark` so a teacher's own
 * wording in `formTeacherRemark` is never overwritten.
 */
export async function generateReportCardRemark(reportCardId: string): Promise<string | null> {
  if (!isAiEnabled()) return null;

  const report = await db.reportCard.findUnique({
    where: { id: reportCardId },
    select: {
      averageScore: true,
      positionInClass: true,
      classSize: true,
      daysPresent: true,
      daysAbsent: true,
      totalSchoolDays: true,
      conduct: true,
      student: { select: { firstName: true, gender: true } },
      term: { select: { name: true } },
      lines: {
        select: {
          totalScore: true,
          grade: true,
          remark: true,
          subject: { select: { name: true } },
        },
      },
    },
  });

  if (!report) return null;

  const pronoun =
    report.student.gender === "MALE"
      ? "he/him"
      : report.student.gender === "FEMALE"
        ? "she/her"
        : "they/them";

  const result = await generateText({
    system: `You write end-of-term form teacher remarks for a Ghanaian international school.

Rules:
- 2 to 3 sentences. No more.
- Address the student by first name.
- Name one genuine strength and one specific area to work on, both grounded in the subject results given.
- Warm and professional. Never harsh, never hollow praise.
- No bullet points, no headings, no sign-off.`,
    prompt: `Write the form teacher's remark for ${report.student.firstName} (${pronoun}) for ${report.term.name}.

Results:
${JSON.stringify(
  {
    average: toNumber(report.averageScore),
    position: report.positionInClass,
    classSize: report.classSize,
    attendance: {
      present: report.daysPresent,
      absent: report.daysAbsent,
      total: report.totalSchoolDays,
    },
    conduct: report.conduct,
    subjects: report.lines.map((line) => ({
      subject: line.subject.name,
      score: toNumber(line.totalScore),
      grade: line.grade,
    })),
  },
  null,
  2,
)}`,
    maxTokens: 600,
    effort: "low",
  });

  if (!result) return null;

  await db.reportCard.update({
    where: { id: reportCardId },
    data: { aiRemark: result.data, aiGeneratedAt: new Date() },
  });

  return result.data;
}

// -----------------------------------------------------------------------------
// Custom report narrative
// -----------------------------------------------------------------------------

/** Adds an analytical narrative to the output of a custom report. */
export async function generateReportNarrative(
  reportName: string,
  dataset: string,
  rows: Array<Record<string, unknown>>,
  createdById?: string,
): Promise<InsightPayload | null> {
  if (!isAiEnabled() || !rows.length) return null;

  // Cap the sample so a 5,000-row export does not blow up the prompt.
  const sample = rows.slice(0, 150);

  const prompt = `A member of school management ran a custom report called "${reportName}" over the ${dataset} dataset. ${
    rows.length > sample.length
      ? `It returned ${rows.length} rows; the first ${sample.length} are shown.`
      : `It returned ${rows.length} rows, all shown.`
  }

Interpret the result for them. Say what the data actually shows, call out the outliers, and recommend what to do about it. Do not simply restate the rows.

Data:
${JSON.stringify(sample, null, 2)}`;

  return runInsight(prompt, { reportName, dataset, rowCount: rows.length }, {
    kind: "CUSTOM_REPORT",
    scope: "report",
    scopeId: null,
    createdById,
    ttlHours: 24,
  });
}
