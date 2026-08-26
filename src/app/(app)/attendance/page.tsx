import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, ClipboardCheck, Users, UserX } from "lucide-react";
import type { AttendanceStatus } from "@prisma/client";

import { Alert, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { classSectionScopeFilter } from "@/lib/scope";
import { percentOf } from "@/lib/money";
import { formatDate, formatPercent, toDateOnly } from "@/lib/utils";

import { AttendanceRegister, type RegisterStudent } from "./register";

export const metadata: Metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; date?: string }>;
}) {
  const user = await requirePermission(["attendance.read", "attendance.take"]);
  const { class: sectionId, date: dateParam } = await searchParams;

  // `??` only catches null and undefined, and the date input is not
  // required — clearing it and pressing Go submits `?date=`, an empty
  // string, which sailed past the fallback into new Date("") and reached
  // Prisma as an Invalid Date. There is no error boundary, so the register
  // became "Application error" until someone edited the URL. Anything that
  // is not a real calendar date falls back to today.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "")
    ? new Date(`${dateParam}T00:00:00Z`)
    : null;
  const date =
    parsed && !Number.isNaN(parsed.getTime())
      ? (dateParam as string)
      : new Date().toISOString().slice(0, 10);

  const term = await db.term.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true, isLocked: true },
  });

  // A teacher sees their own classes; the office sees all of them.
  //
  // This used to ask `attendance.report`, which every teacher holds — so the
  // comment above was true of the intention and false of the behaviour, and
  // any teacher could open, and mark, any register in the school. The
  // question now has one answer, shared with every other surface.
  const sections = await db.classSection.findMany({
    where: {
      isActive: true,
      ...(await classSectionScopeFilter(user)),
    },
    orderBy: [{ classLevel: { sequence: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      classLevel: { select: { name: true } },
      _count: { select: { enrollments: true } },
    },
    distinct: ["id"],
  });

  if (!term) {
    return (
      <>
        <PageHeader title="Attendance" />
        <Alert tone="warning" title="No current term">
          Mark an academic term as current before taking attendance.
        </Alert>
      </>
    );
  }

  const selected = sectionId
    ? sections.find((section) => section.id === sectionId)
    : undefined;

  // --- Overview of who has and has not submitted today ---------------------
  const dayStart = toDateOnly(date);
  const submitted = await db.attendanceSession.findMany({
    // The same classes the list below shows. The denominator of "Registers
    // submitted" is sections.length — the viewer's classes — so counting
    // every session in the school gave a numerator from one population and a
    // denominator from another.
    where: {
      date: dayStart,
      type: "DAILY",
      classSectionId: { in: sections.map((section) => section.id) },
    },
    select: {
      classSectionId: true,
      takenAt: true,
      records: { select: { status: true } },
    },
  });
  const submittedBySection = new Map(
    submitted.map((session) => [session.classSectionId, session]),
  );

  const totalRecords = submitted.flatMap((session) => session.records);
  const presentCount = totalRecords.filter((record) =>
    ["PRESENT", "LATE", "EXCUSED", "HALF_DAY"].includes(record.status),
  ).length;

  return (
    <>
      <PageHeader
        title="Attendance"
        description={`${term.name} · register for ${formatDate(date, "full")}`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Registers submitted"
          value={`${submitted.length}/${sections.length}`}
          tone={submitted.length === sections.length ? "success" : "warning"}
          icon={<ClipboardCheck className="size-4" />}
          hint="Classes marked today"
        />
        <StatCard
          label="Students marked"
          value={totalRecords.length.toLocaleString()}
          tone="violet"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Attendance rate"
          value={
            totalRecords.length
              ? formatPercent(percentOf(presentCount, totalRecords.length))
              : "-"
          }
          tone={
            !totalRecords.length
              ? "neutral"
              : percentOf(presentCount, totalRecords.length) >= 90
                ? "success"
                : "warning"
          }
          icon={<CalendarCheck className="size-4" />}
        />
        <StatCard
          label="Absent today"
          value={(totalRecords.length - presentCount).toLocaleString()}
          tone={totalRecords.length - presentCount > 0 ? "danger" : "success"}
          icon={<UserX className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Class picker */}
        <Card className="h-fit">
          <CardHeader title="Classes" description="Pick a class to take the register" />
          {sections.length === 0 ? (
            <EmptyState
              title="No classes assigned"
              description="You are not currently assigned to any class."
            />
          ) : (
            <ul className="max-h-[560px] divide-y divide-[var(--border)] overflow-y-auto">
              {sections.map((section) => {
                const session = submittedBySection.get(section.id);
                const isActive = section.id === sectionId;
                return (
                  <li key={section.id}>
                    <Link
                      href={`/attendance?class=${section.id}&date=${date}`}
                      className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                        isActive
                          ? "bg-[var(--primary-soft)] font-medium text-[var(--primary)]"
                          : "hover:bg-[var(--bg-subtle)]"
                      }`}
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          session ? "bg-[var(--success)]" : "bg-[var(--border-strong)]"
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {section.classLevel.name} {section.name}
                      </span>
                      <span className="numeric shrink-0 text-xs text-[var(--text-subtle)]">
                        {section._count.enrollments}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-[var(--border)] p-4">
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
              Date
            </label>
            <form method="get" className="flex gap-2">
              {sectionId ? (
                <input type="hidden" name="class" value={sectionId} />
              ) : null}
              <input
                type="date"
                name="date"
                defaultValue={date}
                max={new Date().toISOString().slice(0, 10)}
                className="input-base h-9"
              />
              <button
                type="submit"
                className="h-9 rounded-lg border border-[var(--border-strong)] px-3 text-sm font-medium"
              >
                Go
              </button>
            </form>
          </div>
        </Card>

        {/* Register */}
        <div>
          {!selected ? (
            <Card>
              <EmptyState
                icon={<CalendarCheck className="size-5" />}
                title="Select a class"
                description="Choose a class from the list to take or review its register."
              />
            </Card>
          ) : (
            <RegisterPanel
              sectionId={selected.id}
              className={`${selected.classLevel.name} ${selected.name}`}
              termId={term.id}
              date={date}
              locked={term.isLocked || !userCan(user, "attendance.take")}
            />
          )}
        </div>
      </div>
    </>
  );
}

async function RegisterPanel({
  sectionId,
  className,
  termId,
  date,
  locked,
}: {
  sectionId: string;
  className: string;
  termId: string;
  date: string;
  locked: boolean;
}) {
  const dayStart = toDateOnly(date);

  const [enrollments, session, termRecords] = await Promise.all([
    db.enrollment.findMany({
      where: { classSectionId: sectionId, status: "ACTIVE" },
      orderBy: [{ rollNumber: "asc" }, { student: { lastName: "asc" } }],
      select: {
        rollNumber: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
            photoUrl: true,
          },
        },
      },
    }),
    db.attendanceSession.findFirst({
      where: { classSectionId: sectionId, date: dayStart, type: "DAILY" },
      select: {
        isLocked: true,
        takenAt: true,
        records: { select: { studentId: true, status: true } },
      },
    }),
    db.attendanceRecord.groupBy({
      by: ["studentId", "status"],
      where: { session: { termId, classSectionId: sectionId } },
      _count: { _all: true },
    }),
  ]);

  const rateByStudent = new Map<string, { present: number; total: number }>();
  for (const row of termRecords) {
    const entry = rateByStudent.get(row.studentId) ?? { present: 0, total: 0 };
    entry.total += row._count._all;
    if (["PRESENT", "LATE", "EXCUSED", "HALF_DAY"].includes(row.status)) {
      entry.present += row._count._all;
    }
    rateByStudent.set(row.studentId, entry);
  }

  const students: RegisterStudent[] = enrollments.map((enrollment) => {
    const rate = rateByStudent.get(enrollment.student.id);
    return {
      id: enrollment.student.id,
      fullName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
      admissionNo: enrollment.student.admissionNo,
      photoUrl: enrollment.student.photoUrl,
      rollNumber: enrollment.rollNumber,
      termRate: rate?.total ? (rate.present / rate.total) * 100 : null,
    };
  });

  if (!students.length) {
    return (
      <Card>
        <EmptyState
          title="No students enrolled"
          description="Enrol students into this class before taking a register."
        />
      </Card>
    );
  }

  const existing = Object.fromEntries(
    (session?.records ?? []).map((record) => [record.studentId, record.status]),
  ) as Record<string, AttendanceStatus>;

  return (
    <>
      {session ? (
        <Alert tone="info" className="mb-4">
          This register was already submitted{" "}
          {session.takenAt ? `on ${formatDate(session.takenAt)}` : ""}. Saving again
          will replace it.
        </Alert>
      ) : null}

      <AttendanceRegister
        students={students}
        classSectionId={sectionId}
        termId={termId}
        date={date}
        className={className}
        existing={existing}
        locked={locked || Boolean(session?.isLocked)}
      />
    </>
  );
}
