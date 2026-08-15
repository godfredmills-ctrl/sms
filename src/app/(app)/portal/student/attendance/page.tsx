import type { Metadata } from "next";
import { CalendarCheck, CalendarX, Clock, TriangleAlert } from "lucide-react";

import { BarSeriesChart } from "@/components/charts";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { percentOf } from "@/lib/money";
import { formatDate, formatPercent, humanise } from "@/lib/utils";

import { NotLinked } from "../not-linked";

export const metadata: Metadata = { title: "My Attendance" };
export const dynamic = "force-dynamic";

const PRESENT_STATES = ["PRESENT", "LATE", "EXCUSED", "HALF_DAY"];

export default async function StudentAttendancePage() {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked title="My Attendance" />;

  const records = await db.attendanceRecord.findMany({
    where: { studentId: user.studentId },
    orderBy: { session: { date: "desc" } },
    take: 400,
    include: {
      session: {
        select: {
          date: true,
          type: true,
          periodIndex: true,
          classSection: { select: { name: true } },
          offering: { select: { subject: { select: { name: true } } } },
        },
      },
    },
  });

  const total = records.length;
  const present = records.filter((record) =>
    PRESENT_STATES.includes(record.status),
  ).length;
  const absent = records.filter((record) => record.status === "ABSENT").length;
  const late = records.filter((record) => record.status === "LATE").length;
  const rate = percentOf(present, total);

  // Grouped by month so a dip shows up as a period rather than a scatter of
  // individual days.
  const byMonth = new Map<string, { present: number; absent: number; late: number }>();
  for (const record of records) {
    const key = record.session.date.toISOString().slice(0, 7);
    const bucket = byMonth.get(key) ?? { present: 0, absent: 0, late: 0 };
    if (record.status === "ABSENT") bucket.absent += 1;
    else if (record.status === "LATE") bucket.late += 1;
    else if (PRESENT_STATES.includes(record.status)) bucket.present += 1;
    byMonth.set(key, bucket);
  }

  const monthly = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([month, counts]) => ({
      month: new Date(`${month}-01`).toLocaleDateString("en-GH", {
        month: "short",
        year: "2-digit",
      }),
      ...counts,
    }));

  return (
    <>
      <PageHeader
        title="My attendance"
        description="Every register you have been marked on."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Attendance rate"
          value={total ? formatPercent(rate) : "—"}
          hint={`${present} of ${total} sessions`}
          tone={rate >= 92 ? "success" : rate >= 85 ? "warning" : "danger"}
          icon={<CalendarCheck className="size-4" />}
        />
        <StatCard
          label="Absences"
          value={absent}
          tone={absent ? "danger" : "success"}
          icon={<CalendarX className="size-4" />}
        />
        <StatCard
          label="Late marks"
          value={late}
          tone={late ? "warning" : "success"}
          icon={<Clock className="size-4" />}
        />
        <StatCard label="Sessions recorded" value={total} tone="info" />
      </div>

      {total > 0 && rate < 85 ? (
        <Alert tone="danger" className="mb-4">
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Your attendance is below 85%. Schools usually treat this as the point
            where missed lessons start to show in results — speak to your form
            teacher if something is making it hard to attend.
          </span>
        </Alert>
      ) : null}

      {monthly.length > 1 ? (
        <div className="mb-4">
          <BarSeriesChart
            title="Month by month"
            description="Sessions recorded in each month."
            rows={monthly}
            categoryKey="month"
            categoryLabel="Month"
            stacked
            series={[
              { key: "present", label: "Present" },
              { key: "late", label: "Late" },
              { key: "absent", label: "Absent" },
            ]}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Register history"
          description="Most recent first."
        />
        {records.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {records.slice(0, 100).map((record) => (
              <li
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm">{formatDate(record.session.date)}</p>
                  <p className="text-xs text-[var(--text-subtle)]">
                    {record.session.offering?.subject.name ??
                      humanise(record.session.type)}
                    {record.reason ? ` · ${record.reason}` : ""}
                  </p>
                </div>
                <Badge
                  tone={
                    record.status === "PRESENT"
                      ? "success"
                      : record.status === "ABSENT"
                        ? "danger"
                        : record.status === "LATE"
                          ? "warning"
                          : "neutral"
                  }
                >
                  {humanise(record.status)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<CalendarCheck className="size-5" />}
            title="No attendance recorded"
          />
        )}
      </Card>
    </>
  );
}
