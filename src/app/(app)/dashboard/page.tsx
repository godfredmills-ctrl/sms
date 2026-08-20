import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  GraduationCap,
  Megaphone,
  Receipt,
  TrendingDown,
  Wallet,
} from "lucide-react";

import { AiInsightCard, type InsightView } from "@/components/ai-insight";
import { BarSeriesChart, TrendChart } from "@/components/charts";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { getCachedInsight } from "@/lib/ai/insights";
import { isAiEnabled } from "@/lib/ai/client";
import { requireUser, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, percentOf } from "@/lib/money";
import { formatDate, formatPercent, relativeTime, toNumber } from "@/lib/utils";

import { generateManagementBriefAction } from "./actions";
import { panelsFor } from "@/lib/dashboard";
import { taughtBy } from "@/lib/scope";
import {
  ApprovalsPanel,
  ClinicTodayPanel,
  MyDayPanel,
  MyMarkingPanel,
  MyPayPanel,
  MyRegistersPanel,
} from "./panels/personal";
import {
  AdmissionsPipelinePanel,
  ComingUpPanel,
  MoneyTodayPanel,
  PayrollStatusPanel,
} from "./panels/office";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const canSeeFinance = userCan(user, "dashboard.finance") || userCan(user, "finance.read");
  const canSeeManagement = userCan(user, "dashboard.management");

  // Which panels this person sees, and in what order.
  const viewer = {
    id: user.id,
    staffId: user.staffId,
    permissions: user.permissions,
  };
  const panels = panelsFor(viewer);

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    include: { terms: { where: { isCurrent: true }, take: 1 } },
  });
  const term = year?.terms[0] ?? null;

  const [
    studentCount,
    staffCount,
    todaySessions,
    invoiceTotals,
    attendanceTrend,
    levelBreakdown,
    subjectAverages,
    overdueInvoices,
    recentPayments,
    upcomingEvents,
    cachedBrief,
  ] = await Promise.all([
    db.student.count({ where: { status: "ENROLLED" } }),
    db.staff.count({ where: { status: "ACTIVE" } }),
    todaysAttendance(),
    canSeeFinance
      ? db.invoice.aggregate({
          where: {
            // `academicYearId: undefined` is not a filter — Prisma drops the
            // key — so with no year flagged current the billing tiles quietly
            // widened from this year to every year the school has ever
            // invoiced, under headings that still said the term. An id that
            // matches nothing is the honest answer when there is no year.
            academicYearId: year?.id ?? "__no_current_year__",
            status: { notIn: ["DRAFT", "CANCELLED"] },
          },
          _sum: { totalMinor: true, paidMinor: true, balanceMinor: true },
        })
      : Promise.resolve(null),
    attendanceOverTime(term?.id),
    enrolmentByLevel(),
    term ? subjectAveragesFor(term.id) : Promise.resolve([]),
    canSeeFinance ? overdueList() : Promise.resolve([]),
    canSeeFinance ? recentPaymentList() : Promise.resolve([]),
    upcomingCalendar(),
    canSeeManagement ? getCachedInsight("MANAGEMENT_BRIEF", null) : Promise.resolve(null),
  ]);

  const billed = invoiceTotals?._sum.totalMinor ?? 0;
  const collected = invoiceTotals?._sum.paidMinor ?? 0;
  const outstanding = invoiceTotals?._sum.balanceMinor ?? 0;

  const brief: InsightView | null = cachedBrief
    ? {
        title: cachedBrief.title,
        narrative: cachedBrief.narrative,
        findings: (cachedBrief.findings as InsightView["findings"]) ?? [],
        actions: (cachedBrief.actions as InsightView["actions"]) ?? [],
        createdAt: cachedBrief.createdAt,
        model: cachedBrief.model,
      }
    : null;

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${user.firstName}`}
        description={
          year
            ? `${year.name} · ${term?.name ?? "No active term"}`
            : "No academic year is marked as current — set one up in Academics."
        }
        action={
          <>
            {userCan(user, "attendance.take") ? (
              <LinkButton href="/attendance" variant="outline" size="sm">
                <CalendarCheck className="size-4" />
                Take attendance
              </LinkButton>
            ) : null}
            {userCan(user, "finance.payment.record") ? (
              <LinkButton href="/finance/payments/new" size="sm">
                <Receipt className="size-4" />
                Record payment
              </LinkButton>
            ) : null}
          </>
        }
      />

      {/* ---------------------------------------------------------------- */}
      {/* Yours first                                                       */}
      {/* ---------------------------------------------------------------- */}
      {/*
        Panels are chosen and ordered by src/lib/dashboard.ts: what is
        waiting on you, then what you are responsible for, then the school.
        A panel with nothing to say renders nothing, so a quiet day is a
        short page rather than a wall of zeroes.
      */}
      <div className="mb-6 space-y-4">
        {panels.map((panel) => {
          switch (panel) {
            case "myDay":
              return <MyDayPanel key={panel} viewer={viewer} />;
            case "myRegisters":
              return <MyRegistersPanel key={panel} viewer={viewer} />;
            case "myMarking":
              return <MyMarkingPanel key={panel} viewer={viewer} />;
            case "approvals":
              return <ApprovalsPanel key={panel} viewer={viewer} />;
            case "clinicToday":
              return <ClinicTodayPanel key={panel} viewer={viewer} />;
            case "moneyToday":
              return <MoneyTodayPanel key={panel} viewer={viewer} />;
            case "payrollStatus":
              return <PayrollStatusPanel key={panel} viewer={viewer} />;
            case "admissionsPipeline":
              return <AdmissionsPipelinePanel key={panel} viewer={viewer} />;
            case "myPay":
              return <MyPayPanel key={panel} viewer={viewer} />;
            case "comingUp":
              return <ComingUpPanel key={panel} />;
            default:
              return null;
          }
        })}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* The school                                                        */}
      {/* ---------------------------------------------------------------- */}
      {/*
        The wide view — headcount, attendance trend, fee collection, the
        management brief. Shown to the people whose remit is the school;
        a form teacher's dashboard used to open with a bar chart of
        enrolment by class level, which answered nothing they had asked.
      */}
      {panels.includes("schoolPulse") ? (
        <>
      {/* ---------------------------------------------------------------- */}
      {/* Headline figures                                                  */}
      {/* ---------------------------------------------------------------- */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Students"
          value={studentCount.toLocaleString()}
          hint={`${staffCount} staff · ratio ${staffCount ? (studentCount / staffCount).toFixed(1) : "—"}:1`}
          icon={<GraduationCap className="size-4" />}
          tone="primary"
          href="/students"
        />
        <StatCard
          label="Attendance today"
          value={
            todaySessions.total
              ? formatPercent(percentOf(todaySessions.present, todaySessions.total))
              : "Not taken"
          }
          hint={
            todaySessions.total
              ? `${todaySessions.present}/${todaySessions.total} present`
              : "No registers submitted yet"
          }
          icon={<CalendarCheck className="size-4" />}
          tone={
            !todaySessions.total
              ? "neutral"
              : percentOf(todaySessions.present, todaySessions.total) >= 90
                ? "success"
                : "warning"
          }
          href="/attendance"
        />
        {canSeeFinance ? (
          <>
            <StatCard
              label="Fees collected"
              value={formatMoney(collected, "GHS", { compact: true })}
              hint={`${formatPercent(percentOf(collected, billed))} of ${formatMoney(billed, "GHS", { compact: true })} billed`}
              icon={<Wallet className="size-4" />}
              tone="success"
              href="/finance"
            />
            <StatCard
              label="Outstanding"
              value={formatMoney(outstanding, "GHS", { compact: true })}
              hint={`${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"} overdue`}
              icon={<TrendingDown className="size-4" />}
              tone={outstanding > 0 ? "warning" : "success"}
              href="/finance/invoices"
            />
          </>
        ) : (
          <>
            <StatCard
              label="My classes"
              value={await myClassCount(user.staffId)}
              hint="Subjects taught this term"
              icon={<BookOpen className="size-4" />}
              tone="violet"
              href="/gradebook"
            />
            <StatCard
              label="Announcements"
              value={await db.announcement.count({ where: { status: "PUBLISHED" } })}
              hint="Published school-wide"
              icon={<Megaphone className="size-4" />}
              tone="teal"
              href="/communications/announcements"
            />
          </>
        )}
      </div>


      {/* ---------------------------------------------------------------- */}
      {/* Charts                                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Attendance rate"
          description="Share of students marked present, by school day"
          rows={attendanceTrend}
          categoryKey="day"
          categoryLabel="Date"
          area
          yDomain={[0, 100]}
          series={[
            {
              key: "rate",
              label: "Attendance",
              format: "percent",
            },
          ]}
        />

        {canSeeFinance ? (
          <BarSeriesChart
            title="Fee collection"
            description="Collected against outstanding, by class level"
            rows={await collectionByLevel(year?.id)}
            categoryKey="level"
            categoryLabel="Class level"
            stacked
            series={[
              {
                key: "collected",
                label: "Collected",
                format: "money",
              },
              {
                key: "outstanding",
                label: "Outstanding",
                format: "money",
              },
            ]}
          />
        ) : (
          <BarSeriesChart
            title="Enrolment by level"
            description="Active students in each class level"
            rows={levelBreakdown}
            categoryKey="level"
            categoryLabel="Class level"
            series={[{ key: "students", label: "Students" }]}
          />
        )}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {canSeeFinance ? (
          <BarSeriesChart
            title="Enrolment by level"
            description="Active students in each class level"
            rows={levelBreakdown}
            categoryKey="level"
            categoryLabel="Class level"
            series={[{ key: "students", label: "Students" }]}
          />
        ) : null}

        <BarSeriesChart
          title="Subject performance"
          description="Average score this term, weakest first"
          rows={subjectAverages}
          categoryKey="subject"
          categoryLabel="Subject"
          horizontal
          height={Math.max(220, subjectAverages.length * 30)}
          series={[
            {
              key: "average",
              label: "Average",
              format: "percent",
            },
          ]}
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* AI brief                                                          */}
      {/* ---------------------------------------------------------------- */}
      {canSeeManagement ? (
        <div className="mb-6">
          <AiInsightCard
            insight={brief}
            enabled={isAiEnabled()}
            onGenerate={
              userCan(user, "ai.insight.generate")
                ? generateManagementBriefAction
                : undefined
            }
            emptyHint="Claude will read this term's enrolment, attendance, academic and fee data and write a leadership brief."
          />
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Working lists                                                     */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        {canSeeFinance ? (
          <Card className="lg:col-span-2">
            <CardHeader
              title="Overdue fee accounts"
              description="Oldest first — chase these before the term ends"
              action={
                <LinkButton href="/finance/invoices?status=OVERDUE" variant="ghost" size="sm">
                  View all
                </LinkButton>
              }
            />
            {overdueInvoices.length === 0 ? (
              <EmptyState
                icon={<Wallet className="size-5" />}
                title="Nothing overdue"
                description="Every issued invoice is either paid or still within its due date."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {overdueInvoices.map((invoice) => (
                  <li key={invoice.id}>
                    <Link
                      href={`/finance/invoices/${invoice.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--bg-subtle)]"
                    >
                      <AlertTriangle className="size-4 shrink-0 text-[var(--warning)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {invoice.student.firstName} {invoice.student.lastName}
                        </p>
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          {invoice.invoiceNo} · due {formatDate(invoice.dueDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="numeric text-sm font-semibold">
                          {formatMoney(invoice.balanceMinor)}
                        </p>
                        <StatusBadge status={invoice.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        <Card className={canSeeFinance ? "" : "lg:col-span-2"}>
          <CardHeader title="Coming up" description="Next events on the school calendar" />
          {upcomingEvents.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="The calendar is clear." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="w-11 shrink-0 rounded-lg border border-[var(--border)] py-1 text-center">
                    <p className="text-[10px] tracking-wide text-[var(--text-subtle)] uppercase">
                      {event.startsAt.toLocaleString("en-GB", { month: "short" })}
                    </p>
                    <p className="numeric text-sm font-semibold">
                      {event.startsAt.getDate()}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{event.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {event.isHoliday ? "Holiday" : event.category.toLowerCase()} ·{" "}
                      {relativeTime(event.startsAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canSeeFinance && recentPayments.length > 0 ? (
          <Card className="lg:col-span-3">
            <CardHeader
              title="Recent payments"
              action={
                <LinkButton href="/finance/payments" variant="ghost" size="sm">
                  View all
                </LinkButton>
              }
            />
            <ul className="divide-y divide-[var(--border)]">
              {recentPayments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {payment.student.firstName} {payment.student.lastName}
                  </span>
                  <Badge tone="neutral">
                    {payment.channel.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                  <span className="numeric text-xs text-[var(--text-subtle)]">
                    {payment.receiptNo}
                  </span>
                  <span className="numeric text-sm font-semibold">
                    {formatMoney(payment.amountMinor)}
                  </span>
                  <span className="text-xs text-[var(--text-subtle)]">
                    {relativeTime(payment.paidAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
        </>
      ) : null}
    </>
  );
}

// -----------------------------------------------------------------------------
// Data helpers
// -----------------------------------------------------------------------------

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

async function todaysAttendance() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const rows = await db.attendanceRecord.groupBy({
    by: ["status"],
    where: { session: { date: { gte: start } } },
    _count: { _all: true },
  });

  const total = rows.reduce((sum, row) => sum + row._count._all, 0);
  const present = rows
    .filter((row) => ["PRESENT", "LATE", "EXCUSED", "HALF_DAY"].includes(row.status))
    .reduce((sum, row) => sum + row._count._all, 0);

  return { total, present };
}

async function attendanceOverTime(termId: string | undefined) {
  if (!termId) return [];

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const sessions = await db.attendanceSession.findMany({
    where: { termId, date: { gte: since } },
    select: {
      date: true,
      records: { select: { status: true } },
    },
    orderBy: { date: "asc" },
  });

  const byDay = new Map<string, { present: number; total: number }>();
  for (const session of sessions) {
    const key = session.date.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { present: 0, total: 0 };
    for (const record of session.records) {
      entry.total += 1;
      if (["PRESENT", "LATE", "EXCUSED", "HALF_DAY"].includes(record.status)) {
        entry.present += 1;
      }
    }
    byDay.set(key, entry);
  }

  return Array.from(byDay.entries())
    .slice(-14)
    .map(([day, value]) => ({
      day: new Date(day).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      rate: value.total ? Math.round((value.present / value.total) * 1000) / 10 : 0,
    }));
}

async function enrolmentByLevel() {
  const levels = await db.classLevel.findMany({
    where: { isActive: true },
    orderBy: { sequence: "asc" },
    select: {
      name: true,
      sections: {
        // ACTIVE only — the same reason as the gradebook. Enrolment rows are
        // kept, not deleted: a leaver is flipped to WITHDRAWN and a promotion
        // writes a new row for the new year. Counted raw, "Enrolment by class
        // level" grew every September whether or not the school did, and the
        // bars stopped matching the headcount tile beside them.
        select: {
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  return levels
    .map((level) => ({
      level: level.name,
      students: level.sections.reduce(
        (sum, section) => sum + section._count.enrollments,
        0,
      ),
    }))
    .filter((row) => row.students > 0);
}

async function subjectAveragesFor(termId: string) {
  const scores = await db.assessmentScore.findMany({
    where: { assessment: { termId }, isAbsent: false, score: { not: null } },
    select: {
      score: true,
      assessment: {
        select: {
          maxScore: true,
          offering: { select: { subject: { select: { name: true } } } },
        },
      },
    },
  });

  const bySubject = new Map<string, number[]>();
  for (const row of scores) {
    const max = toNumber(row.assessment.maxScore) ?? 100;
    const name = row.assessment.offering.subject.name;
    bySubject.set(name, [
      ...(bySubject.get(name) ?? []),
      ((toNumber(row.score) ?? 0) / max) * 100,
    ]);
  }

  return Array.from(bySubject.entries())
    .map(([subject, values]) => ({
      subject,
      average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
    }))
    .sort((a, b) => a.average - b.average)
    .slice(0, 10);
}

async function collectionByLevel(academicYearId: string | undefined) {
  if (!academicYearId) return [];

  const invoices = await db.invoice.findMany({
    where: { academicYearId, status: { notIn: ["DRAFT", "CANCELLED"] } },
    select: {
      paidMinor: true,
      balanceMinor: true,
      student: {
        select: {
          enrollments: {
            where: { academicYearId },
            take: 1,
            select: {
              classSection: {
                select: { classLevel: { select: { name: true, sequence: true } } },
              },
            },
          },
        },
      },
    },
  });

  const byLevel = new Map<
    string,
    { sequence: number; collected: number; outstanding: number }
  >();

  for (const invoice of invoices) {
    const level = invoice.student.enrollments[0]?.classSection.classLevel;
    if (!level) continue;
    const entry =
      byLevel.get(level.name) ??
      { sequence: level.sequence, collected: 0, outstanding: 0 };
    entry.collected += invoice.paidMinor;
    entry.outstanding += invoice.balanceMinor;
    byLevel.set(level.name, entry);
  }

  return Array.from(byLevel.entries())
    .sort((a, b) => a[1].sequence - b[1].sequence)
    .map(([level, value]) => ({
      level,
      // Charted in major units so the axis reads in cedis, not pesewas.
      collected: Math.round(value.collected / 100),
      outstanding: Math.round(value.outstanding / 100),
    }));
}

async function overdueList() {
  return db.invoice.findMany({
    where: {
      status: { in: ["OVERDUE", "PART_PAID", "ISSUED"] },
      balanceMinor: { gt: 0 },
      dueDate: { lt: new Date() },
    },
    orderBy: { dueDate: "asc" },
    take: 6,
    select: {
      id: true,
      invoiceNo: true,
      status: true,
      balanceMinor: true,
      dueDate: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });
}

async function recentPaymentList() {
  return db.payment.findMany({
    where: { status: "SUCCESS" },
    orderBy: { paidAt: "desc" },
    take: 6,
    select: {
      id: true,
      receiptNo: true,
      amountMinor: true,
      channel: true,
      paidAt: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });
}

async function upcomingCalendar() {
  return db.calendarEvent.findMany({
    where: { startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 5,
    select: {
      id: true,
      title: true,
      startsAt: true,
      category: true,
      isHoliday: true,
    },
  });
}

async function myClassCount(staffId: string | null) {
  if (!staffId) return 0;
  return db.subjectOffering.count({ where: { ...taughtBy(staffId), isActive: true } });
}
