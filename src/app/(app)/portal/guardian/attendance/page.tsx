import type { Metadata } from "next";
import { CalendarCheck, CalendarX, Clock } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { percentOf } from "@/lib/money";
import { formatDate, formatPercent, fullName, humanise } from "@/lib/utils";

import { NotLinked } from "../not-linked";
import { wardsFor } from "../wards";

export const metadata: Metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

const PRESENT_STATES = ["PRESENT", "LATE", "EXCUSED", "HALF_DAY"];

export default async function GuardianAttendancePage() {
  const user = await requireUser();
  if (!user.guardianId) return <NotLinked title="Attendance" />;

  const links = await wardsFor(user.guardianId);
  if (!links.length) return <NotLinked title="Attendance" />;

  const studentIds = links.map((link) => link.student.id);

  const [summary, absences] = await Promise.all([
    db.attendanceRecord.groupBy({
      by: ["studentId", "status"],
      where: { studentId: { in: studentIds } },
      _count: { _all: true },
    }),
    // Only the exceptions are listed. A parent needs the days their child was
    // not in class, not a receipt for every day they were.
    db.attendanceRecord.findMany({
      where: { studentId: { in: studentIds }, status: { in: ["ABSENT", "LATE"] } },
      orderBy: { session: { date: "desc" } },
      take: 100,
      include: {
        session: {
          select: {
            date: true,
            type: true,
            offering: { select: { subject: { select: { name: true } } } },
          },
        },
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  const perStudent = links.map((link) => {
    const rows = summary.filter((row) => row.studentId === link.student.id);
    const total = rows.reduce((sum, row) => sum + row._count._all, 0);
    const present = rows
      .filter((row) => PRESENT_STATES.includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);
    const absent =
      rows.find((row) => row.status === "ABSENT")?._count._all ?? 0;
    const late = rows.find((row) => row.status === "LATE")?._count._all ?? 0;

    return { link, total, present, absent, late, rate: percentOf(present, total) };
  });

  const overall = perStudent.reduce(
    (acc, entry) => ({
      total: acc.total + entry.total,
      present: acc.present + entry.present,
      absent: acc.absent + entry.absent,
      late: acc.late + entry.late,
    }),
    { total: 0, present: 0, absent: 0, late: 0 },
  );

  const atRisk = perStudent.filter((entry) => entry.total > 0 && entry.rate < 85);

  return (
    <>
      <PageHeader
        title="Attendance"
        description="How often each child has been in class, and the days they were not."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Overall attendance"
          value={
            overall.total ? formatPercent(percentOf(overall.present, overall.total)) : "-"
          }
          hint={`${overall.present} of ${overall.total} sessions`}
          tone={
            percentOf(overall.present, overall.total) >= 92
              ? "success"
              : percentOf(overall.present, overall.total) >= 85
                ? "warning"
                : "danger"
          }
          icon={<CalendarCheck className="size-4" />}
        />
        <StatCard
          label="Absences"
          value={overall.absent}
          tone={overall.absent ? "warning" : "success"}
          icon={<CalendarX className="size-4" />}
        />
        <StatCard
          label="Late marks"
          value={overall.late}
          tone={overall.late ? "warning" : "success"}
          icon={<Clock className="size-4" />}
        />
        <StatCard label="Children" value={links.length} tone="violet" />
      </div>

      {atRisk.length ? (
        <Alert tone="danger" className="mb-4">
          {atRisk.map((entry) => entry.link.student.firstName).join(" and ")}{" "}
          {atRisk.length === 1 ? "is" : "are"} below 85% attendance. Schools treat that
          as the level where missed lessons begin to show in results: the form
          teacher can help if something is making attendance hard.
        </Alert>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {perStudent.map((entry) => (
          <Card key={entry.link.student.id}>
            <CardBody>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {fullName(entry.link.student)}
                </span>
                <span className="numeric text-sm">
                  {entry.total ? formatPercent(entry.rate) : "-"}
                </span>
              </div>
              <ProgressBar
                value={entry.rate}
                tone={
                  entry.rate >= 92 ? "success" : entry.rate >= 85 ? "warning" : "danger"
                }
                label={`${fullName(entry.link.student)} attendance`}
              />
              <p className="mt-1.5 text-xs text-[var(--text-subtle)]">
                {entry.present} attended · {entry.absent} absent · {entry.late} late
              </p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Days missed"
          description="Absences and late marks only."
        />
        {absences.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {absences.map((record) => (
              <li
                key={record.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm">
                    {record.student.firstName} {record.student.lastName}
                  </p>
                  <p className="text-xs text-[var(--text-subtle)]">
                    {formatDate(record.session.date)} ·{" "}
                    {record.session.offering?.subject.name ??
                      humanise(record.session.type)}
                    {record.reason ? ` · ${record.reason}` : ""}
                  </p>
                </div>
                <Badge tone={record.status === "ABSENT" ? "danger" : "warning"}>
                  {humanise(record.status)}
                  {record.minutesLate ? ` ${record.minutesLate}m` : ""}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<CalendarCheck className="size-5" />}
            title="Full attendance"
            description="No absences or late marks on record."
          />
        )}
      </Card>
    </>
  );
}
