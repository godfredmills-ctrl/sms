import type { Metadata } from "next";
import {
  AlertTriangle,
  BadgePercent,
  CalendarCheck,
  GraduationCap,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { AiInsightCard, type InsightView } from "@/components/ai-insight";
import { BarSeriesChart, TrendChart } from "@/components/charts";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui";
import { isAiEnabled } from "@/lib/ai/client";
import { getCachedInsight } from "@/lib/ai/insights";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, percentOf, toMajor } from "@/lib/money";
import { formatPercent, humanise, toNumber } from "@/lib/utils";

import {
  generateAtRiskScanAction,
  generateManagementBriefAction,
} from "../dashboard/actions";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const PRESENT_STATES = ["PRESENT", "LATE", "EXCUSED", "HALF_DAY"];

export default async function AnalyticsPage() {
  // Whole-school analytics: attendance, results and money across every
  // class. requirePermission takes any-of, so pairing this with report.read
  // — which the teaching presets hold — let every teacher in.
  const user = await requirePermission("dashboard.management");
  const canSeeFinance = userCan(user, "finance.read");

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: {
      id: true,
      name: true,
      terms: { orderBy: { sequence: "asc" }, select: { id: true, name: true, isCurrent: true } },
    },
  });
  const term = year?.terms.find((entry) => entry.isCurrent);

  const [
    students,
    staffCount,
    levels,
    attendanceByStatus,
    scores,
    invoiceTotals,
    paymentsByChannel,
    termInvoices,
    brief,
    atRisk,
  ] = await Promise.all([
    db.student.findMany({
      where: { status: "ENROLLED" },
      select: {
        gender: true,
        isBoarder: true,
        nationality: true,
        enrollments: {
          where: { status: "ACTIVE" },
          take: 1,
          select: {
            classSection: {
              select: { classLevel: { select: { name: true, sequence: true } } },
            },
          },
        },
      },
    }),
    db.staff.count({ where: { status: "ACTIVE" } }),
    db.classLevel.findMany({
      orderBy: { sequence: "asc" },
      select: { id: true, name: true, sequence: true },
    }),
    db.attendanceRecord.groupBy({
      by: ["status"],
      where: term ? { session: { termId: term.id } } : {},
      _count: { _all: true },
    }),
    db.assessmentScore.findMany({
      where: term ? { assessment: { termId: term.id }, isAbsent: false } : { isAbsent: false },
      select: {
        score: true,
        assessment: {
          select: {
            maxScore: true,
            offering: {
              select: {
                subject: { select: { name: true } },
                classSection: {
                  select: { classLevel: { select: { name: true, sequence: true } } },
                },
              },
            },
          },
        },
      },
    }),
    canSeeFinance
      ? db.invoice.aggregate({
          where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
          _sum: { totalMinor: true, paidMinor: true, balanceMinor: true },
          _count: { _all: true },
        })
      : Promise.resolve(null),
    canSeeFinance
      ? db.payment.groupBy({
          by: ["channel"],
          where: { status: "SUCCESS" },
          _sum: { amountMinor: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    canSeeFinance && year
      ? db.invoice.groupBy({
          by: ["termId"],
          where: { academicYearId: year.id, status: { notIn: ["DRAFT", "CANCELLED"] } },
          _sum: { totalMinor: true, paidMinor: true },
        })
      : Promise.resolve([]),
    getCachedInsight("MANAGEMENT_BRIEF", null),
    term ? getCachedInsight("AT_RISK_SCAN", term.id) : Promise.resolve(null),
  ]);

  // --- Enrolment -----------------------------------------------------------
  const byLevel = new Map<string, { name: string; sequence: number; count: number }>();
  for (const level of levels) {
    byLevel.set(level.name, { name: level.name, sequence: level.sequence, count: 0 });
  }
  for (const student of students) {
    const name = student.enrollments[0]?.classSection.classLevel.name;
    if (!name) continue;
    const entry = byLevel.get(name);
    if (entry) entry.count += 1;
  }

  const enrolmentRows = [...byLevel.values()]
    .sort((a, b) => a.sequence - b.sequence)
    .map((entry) => ({ level: entry.name, students: entry.count }));

  const male = students.filter((student) => student.gender === "MALE").length;
  const female = students.filter((student) => student.gender === "FEMALE").length;
  const boarders = students.filter((student) => student.isBoarder).length;
  const international = students.filter(
    (student) => student.nationality && student.nationality !== "Ghanaian",
  ).length;

  // --- Attendance ----------------------------------------------------------
  const attendanceTotal = attendanceByStatus.reduce(
    (sum, row) => sum + row._count._all,
    0,
  );
  const attendancePresent = attendanceByStatus
    .filter((row) => PRESENT_STATES.includes(row.status))
    .reduce((sum, row) => sum + row._count._all, 0);
  const attendanceRate = percentOf(attendancePresent, attendanceTotal);

  const attendanceRows = attendanceByStatus
    .map((row) => ({ status: humanise(row.status), sessions: row._count._all }))
    .sort((a, b) => b.sessions - a.sessions);

  // --- Academics -----------------------------------------------------------
  const bySubject = new Map<string, number[]>();
  const byLevelScores = new Map<string, { sequence: number; values: number[] }>();

  for (const row of scores) {
    const max = toNumber(row.assessment.maxScore) ?? 100;
    const percent = ((toNumber(row.score) ?? 0) / max) * 100;

    const subject = row.assessment.offering.subject.name;
    bySubject.set(subject, [...(bySubject.get(subject) ?? []), percent]);

    const level = row.assessment.offering.classSection.classLevel;
    const bucket = byLevelScores.get(level.name) ?? {
      sequence: level.sequence,
      values: [],
    };
    bucket.values.push(percent);
    byLevelScores.set(level.name, bucket);
  }

  const mean = (values: number[]) =>
    values.length
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
      : 0;

  const subjectRows = [...bySubject.entries()]
    .map(([subject, values]) => ({
      subject,
      average: mean(values),
      sampleSize: values.length,
    }))
    .sort((a, b) => a.average - b.average);

  const levelScoreRows = [...byLevelScores.entries()]
    .sort(([, a], [, b]) => a.sequence - b.sequence)
    .map(([level, bucket]) => ({ level, average: mean(bucket.values) }));

  const schoolAverage = mean(scores.map((row) => {
    const max = toNumber(row.assessment.maxScore) ?? 100;
    return ((toNumber(row.score) ?? 0) / max) * 100;
  }));

  // --- Finance -------------------------------------------------------------
  const billed = invoiceTotals?._sum.totalMinor ?? 0;
  const collected = invoiceTotals?._sum.paidMinor ?? 0;
  const outstanding = invoiceTotals?._sum.balanceMinor ?? 0;

  const termNames = new Map((year?.terms ?? []).map((entry) => [entry.id, entry.name]));
  const collectionRows = termInvoices
    .map((row) => ({
      term: row.termId ? (termNames.get(row.termId) ?? "Other") : "Unassigned",
      billed: toMajor(row._sum.totalMinor ?? 0),
      collected: toMajor(row._sum.paidMinor ?? 0),
    }))
    .sort((a, b) => a.term.localeCompare(b.term));

  const channelRows = paymentsByChannel
    .map((row) => ({
      channel: humanise(row.channel),
      value: toMajor(row._sum.amountMinor ?? 0),
    }))
    .sort((a, b) => b.value - a.value);

  const briefView: InsightView | null = brief
    ? {
        title: brief.title,
        narrative: brief.narrative,
        findings: (brief.findings ?? []) as InsightView["findings"],
        actions: (brief.actions ?? []) as InsightView["actions"],
        createdAt: brief.createdAt,
        model: brief.model,
      }
    : null;

  const atRiskView: InsightView | null = atRisk
    ? {
        title: atRisk.title,
        narrative: atRisk.narrative,
        findings: (atRisk.findings ?? []) as InsightView["findings"],
        actions: (atRisk.actions ?? []) as InsightView["actions"],
        createdAt: atRisk.createdAt,
        model: atRisk.model,
      }
    : null;

  const canGenerate = userCan(user, "ai.insight.generate");

  return (
    <>
      <PageHeader
        title="Analytics"
        description={
          year
            ? `${year.name}${term ? ` · ${term.name}` : ""} — school-wide statistics.`
            : "No current academic year is set."
        }
      />

      {!term ? (
        <Alert tone="warning" className="mb-4">
          No current term is set, so the figures below cover every term on record
          rather than the one in progress.
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Students enrolled"
          value={students.length.toLocaleString()}
          hint={`${male} boys · ${female} girls`}
          tone="violet"
          icon={<GraduationCap className="size-4" />}
        />
        <StatCard
          label="Student–teacher ratio"
          value={staffCount ? `${(students.length / staffCount).toFixed(1)}:1` : "—"}
          hint={`${staffCount} active staff`}
          tone="info"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Attendance"
          value={attendanceTotal ? formatPercent(attendanceRate) : "—"}
          hint={`${attendanceTotal.toLocaleString()} sessions recorded`}
          tone={
            attendanceRate >= 92 ? "success" : attendanceRate >= 85 ? "warning" : "danger"
          }
          icon={<CalendarCheck className="size-4" />}
        />
        <StatCard
          label="School average"
          value={schoolAverage ? `${schoolAverage.toFixed(1)}%` : "—"}
          hint={`${scores.length.toLocaleString()} marks`}
          tone="teal"
          icon={<TrendingUp className="size-4" />}
        />
      </div>

      {canSeeFinance ? (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Billed"
            value={formatMoney(billed, "GHS", { compact: true })}
            hint={`${invoiceTotals?._count._all ?? 0} invoices`}
            tone="info"
            icon={<Wallet className="size-4" />}
          />
          <StatCard
            label="Collected"
            value={formatMoney(collected, "GHS", { compact: true })}
            hint={formatPercent(percentOf(collected, billed))}
            tone="success"
          />
          <StatCard
            label="Outstanding"
            value={formatMoney(outstanding, "GHS", { compact: true })}
            tone={outstanding > 0 ? "warning" : "success"}
          />
          <StatCard
            label="Boarders"
            value={`${percentOf(boarders, students.length).toFixed(0)}%`}
            hint={`${boarders} of ${students.length} · ${international} international`}
            tone="violet"
            icon={<BadgePercent className="size-4" />}
          />
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <BarSeriesChart
          title="Enrolment by level"
          description="Active enrolments in each class level."
          rows={enrolmentRows}
          categoryKey="level"
          categoryLabel="Level"
          series={[{ key: "students", label: "Students" }]}
        />

        <BarSeriesChart
          title="Attendance breakdown"
          description={
            term ? `Sessions recorded this ${term.name.toLowerCase()}.` : "All sessions."
          }
          rows={attendanceRows}
          categoryKey="status"
          categoryLabel="Status"
          series={[{ key: "sessions", label: "Sessions" }]}
          horizontal
        />
      </div>

      {levelScoreRows.length ? (
        <div className="mb-4">
          <TrendChart
            title="Attainment by level"
            description="Average mark at each level, in sequence — a dip is where the curriculum steps up."
            rows={levelScoreRows}
            categoryKey="level"
            categoryLabel="Level"
            series={[{ key: "average", label: "Average", format: "percent" }]}
            yDomain={[0, 100]}
            area
          />
        </div>
      ) : null}

      {canSeeFinance && collectionRows.length ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <BarSeriesChart
            title="Billed against collected"
            description="By term, in cedis."
            rows={collectionRows}
            categoryKey="term"
            categoryLabel="Term"
            series={[
              { key: "billed", label: "Billed", format: "money" },
              { key: "collected", label: "Collected", format: "money" },
            ]}
          />
          <BarSeriesChart
            title="How parents pay"
            description="Successful payments by channel — this is where reminders should point."
            rows={channelRows}
            categoryKey="channel"
            categoryLabel="Channel"
            series={[{ key: "value", label: "Value", format: "money" }]}
            horizontal
          />
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Subjects ranked"
            description="Weakest first, against the school average — the order is the point."
          />
          <CardBody className="space-y-2.5">
            {subjectRows.length ? (
              subjectRows.map((row) => {
                const gap = row.average - schoolAverage;
                return (
                  <div key={row.subject}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{row.subject}</span>
                      <span className="numeric shrink-0">
                        {row.average.toFixed(1)}%
                        <span
                          className={`ml-1.5 text-xs ${
                            gap >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                          }`}
                        >
                          {gap >= 0 ? "+" : ""}
                          {gap.toFixed(1)}
                        </span>
                      </span>
                    </div>
                    <ProgressBar
                      value={row.average}
                      tone={
                        row.average >= schoolAverage
                          ? "success"
                          : row.average >= schoolAverage - 10
                            ? "warning"
                            : "danger"
                      }
                      label={`${row.subject} average ${row.average.toFixed(1)}%`}
                    />
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                No marks recorded for this term yet.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Cohort composition"
            description="Who is in the school right now."
          />
          <CardBody className="space-y-3">
            {[
              { label: "Boys", value: male },
              { label: "Girls", value: female },
              { label: "Boarders", value: boarders },
              { label: "Day students", value: students.length - boarders },
              { label: "International", value: international },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span>{row.label}</span>
                  <span className="numeric">
                    {row.value.toLocaleString()}
                    <span className="ml-1.5 text-xs text-[var(--text-subtle)]">
                      {percentOf(row.value, students.length).toFixed(0)}%
                    </span>
                  </span>
                </div>
                <ProgressBar
                  value={percentOf(row.value, students.length)}
                  tone="primary"
                  label={`${row.label}: ${row.value}`}
                />
              </div>
            ))}

            <div className="border-t border-[var(--border)] pt-3">
              <p className="text-xs text-[var(--text-muted)]">
                Levels represented:{" "}
                {enrolmentRows.filter((row) => row.students > 0).length} of{" "}
                {levels.length}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {enrolmentRows
                  .filter((row) => row.students === 0)
                  .map((row) => (
                    <Badge key={row.level} tone="warning">
                      {row.level}: empty
                    </Badge>
                  ))}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AiInsightCard
          insight={briefView}
          enabled={isAiEnabled()}
          onGenerate={canGenerate ? generateManagementBriefAction : undefined}
          emptyHint="Ask Claude to read the figures above and write the leadership brief."
        />

        <AiInsightCard
          insight={atRiskView}
          enabled={isAiEnabled() && Boolean(term)}
          onGenerate={canGenerate && term ? generateAtRiskScanAction : undefined}
          emptyHint="Screen every enrolled student for attendance below 85% or an average below 45%, then triage them."
        />
      </div>

      {!term ? (
        <Alert tone="info" className="mt-4">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            The at-risk scan needs a current term to know which marks and registers to
            read.
          </span>
        </Alert>
      ) : null}
    </>
  );
}
