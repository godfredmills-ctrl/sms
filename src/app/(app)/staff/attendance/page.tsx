import type { Metadata } from "next";
import { AlertTriangle, CalendarOff, CheckCircle2, Clock, UserCheck, UserX } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  absencesFromLeave,
  absentOn,
  completeness,
  dayKey,
  effectiveFor,
  holidaysFromCalendar,
  missingRegisters,
  parseDay,
  schoolDay,
  statusLabel,
  summarise,
  today,
  type Effective,
  type Mark,
} from "@/lib/staff-attendance-rules";
import { formatDate, fullName } from "@/lib/utils";

import { DayPicker, MarkRemainingForm, MarkRow } from "./register-forms";

export const metadata: Metadata = { title: "Staff attendance" };
export const dynamic = "force-dynamic";

/**
 * The staff sign-in book for one day.
 *
 * Nothing about leave is stored here. Who is off is read from the leave table
 * every time the page loads, so leave approved on Friday for the previous
 * Tuesday corrects Tuesday's register rather than leaving an ABSENT behind for
 * payroll to find. src/lib/staff-attendance-rules.ts carries the argument.
 *
 * The two numbers at the top are deliberately separate. "94% present" and "the
 * register is 40% marked" are different facts, and a screen showing only the
 * first invites a school to read a rate computed from four people out of forty
 * as though it described the school.
 */
export default async function StaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requirePermission([
    "staff.attendance.read",
    "staff.attendance.record",
  ]);
  // Reading and marking are different jobs. A bursar reads this register
  // because absence is an input to pay and deliberately cannot mark it, so the
  // controls have to come and go rather than the page.
  const canRecord = userCan(user, "staff.attendance.record");

  const { date: requested } = await searchParams;
  const date = parseDay(requested ?? "") ?? today();
  const key = dayKey(date);

  const [staff, marks, leaveRows, terms, holidayRows, recorder] = await Promise.all([
    db.staff.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, jobTitle: true, department: true },
    }),
    db.staffAttendance.findMany({
      where: { date },
      select: {
        staffId: true,
        status: true,
        arrivedMinutes: true,
        leftMinutes: true,
        minutesLate: true,
        reason: true,
      },
    }),
    db.staffLeave.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: new Date(date.getTime() + 86_400_000) },
        endDate: { gte: new Date(date.getTime() - 86_400_000) },
      },
      select: { staffId: true, startDate: true, endDate: true, leaveType: true },
    }),
    db.term.findMany({
      where: { academicYear: { isCurrent: true } },
      select: { startDate: true, endDate: true },
    }),
    db.calendarEvent.findMany({
      where: { isHoliday: true },
      select: { startsAt: true, endsAt: true, title: true },
    }),
    db.staffAttendance.findFirst({
      where: { date },
      orderBy: { recordedAt: "asc" },
      select: { recordedAt: true, recordedBy: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const onLeave = absentOn(absencesFromLeave(leaveRows), date);
  const holidays = holidaysFromCalendar(holidayRows);
  const day = schoolDay(date, terms, holidays);

  const byStaff = new Map<string, Mark>(
    marks.map((mark) => [
      mark.staffId,
      {
        staffId: mark.staffId,
        status: mark.status as Mark["status"],
        arrivedMinutes: mark.arrivedMinutes,
        leftMinutes: mark.leftMinutes,
        minutesLate: mark.minutesLate,
        reason: mark.reason,
      },
    ]),
  );

  const effective: Effective[] = staff.map((member) =>
    effectiveFor(member.id, byStaff.get(member.id), onLeave),
  );
  const summary = summarise(effective);
  const done = completeness(effective);
  const byId = new Map(effective.map((entry) => [entry.staffId, entry]));

  // Days the school worked this term and nobody opened the register. Invisible
  // on every other screen, because a rate is computed from the days that exist:
  // a term with four registers taken reads as excellent attendance.
  const termSpan = terms.length
    ? {
        from: terms.reduce((a, t) => (t.startDate < a ? t.startDate : a), terms[0].startDate),
        to: today(),
      }
    : null;
  const takenDates = termSpan
    ? (
        await db.staffAttendance.findMany({
          where: { date: { gte: termSpan.from, lte: termSpan.to } },
          distinct: ["date"],
          select: { date: true },
        })
      ).map((row) => row.date)
    : [];
  const gaps = termSpan
    ? missingRegisters(termSpan.from, termSpan.to, takenDates, terms, holidays)
    : [];

  return (
    <>
      <PageHeader
        title="Staff attendance"
        description="Who was at work, and who the school already knew would not be."
        action={<DayPicker date={key} max={dayKey(today())} />}
      />

      {staff.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserCheck className="size-5" />}
            title="No staff to mark"
            description="Add staff records first. There is nobody for this register to be about."
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label="Present"
              value={summary.present + summary.late}
              hint={summary.late ? `${summary.late} of them late` : undefined}
              tone="success"
              icon={<UserCheck className="size-4" />}
            />
            <StatCard
              label="Absent"
              value={summary.absent}
              tone={summary.absent ? "danger" : "neutral"}
              icon={<UserX className="size-4" />}
            />
            <StatCard
              label="On leave"
              value={summary.onLeave}
              hint="Approved, not counted against them"
              tone="info"
              icon={<CalendarOff className="size-4" />}
            />
            <StatCard
              label="Attendance"
              value={summary.rate === null ? "None yet" : `${summary.rate.toFixed(0)}%`}
              hint={
                summary.rate === null
                  ? "Nobody marked yet"
                  : `of ${done.done} marked`
              }
              tone="violet"
              icon={<Clock className="size-4" />}
            />
            <StatCard
              label="Register"
              value={`${done.done} of ${done.needed}`}
              hint={done.complete ? "Complete" : "Still to mark"}
              tone={done.complete ? "success" : "warning"}
              icon={<CheckCircle2 className="size-4" />}
            />
          </div>

          {!day.expected ? (
            <Alert tone="warning" className="mb-4">
              {day.reason === "Outside term"
                ? "This day is outside the current term, so nobody was expected in. Marking it would record absences against people who were on holiday."
                : `${day.reason} is a school holiday. Nobody was expected in.`}
            </Alert>
          ) : null}

          {day.expected && day.reason === "Weekend" ? (
            <Alert tone="info" className="mb-4">
              This is a weekend. Mark it if the school worked, and leave it alone if it did not.
            </Alert>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <Card>
              <CardHeader
                title={formatDate(date)}
                description={
                  recorder
                    ? `First marked by ${recorder.recordedBy ? fullName(recorder.recordedBy) : "an account with no staff record"}.`
                    : "Nobody has marked this register yet."
                }
                action={
                  done.complete ? (
                    <Badge tone="success">Complete</Badge>
                  ) : (
                    <Badge tone="warning">{done.needed - done.done} to mark</Badge>
                  )
                }
              />
              <ul className="divide-y divide-[var(--border)]">
                {staff.map((member) => {
                  const entry = byId.get(member.id)!;
                  return (
                    <MarkRow
                      key={member.id}
                      staffId={member.id}
                      name={fullName(member)}
                      role={member.jobTitle ?? member.department}
                      date={key}
                      status={entry.status}
                      note={entry.note}
                      source={entry.source}
                      arrivedMinutes={entry.arrivedMinutes}
                      leftMinutes={entry.leftMinutes}
                      minutesLate={entry.minutesLate}
                      canRecord={canRecord}
                    />
                  );
                })}
              </ul>
            </Card>

            <div className="space-y-4">
              {canRecord ? (
                <Card>
                  <CardHeader
                    title="The rest of them"
                    description="A register is the exceptions. Everybody else was here."
                  />
                  <CardBody>
                    <MarkRemainingForm date={key} remaining={done.needed - done.done} />
                  </CardBody>
                </Card>
              ) : null}

              <Card>
                <CardHeader
                  title="Who is on leave"
                  description="Read from approved leave, never from this register."
                />
                <CardBody className="space-y-1.5">
                  {onLeave.size === 0 ? (
                    <p className="text-sm text-[var(--text-subtle)]">Nobody, today.</p>
                  ) : (
                    staff
                      .filter((member) => onLeave.has(member.id))
                      .map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 truncate">{fullName(member)}</span>
                          <Badge tone="info">
                            {String(onLeave.get(member.id) ?? "").toLowerCase()}
                          </Badge>
                        </div>
                      ))
                  )}
                  <p className="pt-1 text-xs text-[var(--text-subtle)]">
                    Somebody on approved leave cannot be marked. If they came in, cancel or
                    shorten the leave rather than marking over it, or the two records will
                    disagree and pay is worked out from one of them.
                  </p>
                </CardBody>
              </Card>

              {gaps.length ? (
                <Card>
                  <CardHeader
                    title="Registers nobody took"
                    description="School days this term with no register at all."
                    action={<Badge tone="warning">{gaps.length}</Badge>}
                  />
                  <CardBody className="space-y-1">
                    {gaps.slice(-8).map((gap) => (
                      <a
                        key={dayKey(gap)}
                        href={`/staff/attendance?date=${dayKey(gap)}`}
                        className="block text-sm text-[var(--primary)] hover:underline"
                      >
                        {formatDate(gap)}
                      </a>
                    ))}
                    {gaps.length > 8 ? (
                      <p className="text-xs text-[var(--text-subtle)]">
                        and {gaps.length - 8} earlier.
                      </p>
                    ) : null}
                    <p className="pt-1 text-xs text-[var(--text-subtle)]">
                      A missing register does not lower anybody&rsquo;s attendance: it is left
                      out of the rate. That is why it is listed here instead.
                    </p>
                  </CardBody>
                </Card>
              ) : (
                <Alert tone="success">
                  <AlertTriangle className="hidden" />
                  Every school day this term has a register.
                </Alert>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
