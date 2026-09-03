import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarOff, CheckCircle2, ClipboardList, UserX } from "lucide-react";

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
  absentOn,
  addDays,
  dayKey,
  dayOf,
  isWeekend,
  isoDayOfWeek,
  kindLabel,
  kindTone,
  parseDay,
  periodsToCover,
  rankCandidates,
  slips,
  summarise,
  today,
  type Absence,
  type Arrangement,
  type CoverKind,
  type Lesson,
  type Teacher,
} from "@/lib/cover-rules";
import { formatDate, fullName, humanise } from "@/lib/utils";

import { ArrangeForm, AutoArrangeForm, DayPicker } from "./cover-forms";

export const metadata: Metadata = { title: "Cover" };
export const dynamic = "force-dynamic";

/**
 * The cover board for one day.
 *
 * Two tables in this system already knew half of this and never spoke. Leave
 * approves a teacher for Monday to Wednesday. The timetable goes on saying
 * that teacher takes JHS 2 Amber at 09:30 on Tuesday. Neither row is wrong,
 * nothing errors, and the class sits by itself until somebody walks past.
 *
 * Nothing on this page is stored except the decisions. Who is out is read from
 * the leave table every time it loads, so leave cut short on Tuesday afternoon
 * empties Wednesday's board rather than leaving a slip out for a man who is
 * back at his desk.
 */
export default async function CoverPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requirePermission(["academic.cover.read", "academic.cover.manage"]);
  const mayArrange = userCan(user, "academic.cover.manage");

  const { date: requested } = await searchParams;
  const date = parseDay(requested ?? "") ?? today();
  const day = dayKey(date);
  const dayOfWeek = isoDayOfWeek(date);

  const [slots, leaves, staff, rows] = await Promise.all([
    db.timetableSlot.findMany({
      where: { dayOfWeek, isBreak: false, offeringId: { not: null } },
      orderBy: [{ startTime: "asc" }],
      select: {
        id: true,
        dayOfWeek: true,
        periodIndex: true,
        startTime: true,
        endTime: true,
        room: true,
        classSection: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
        offering: {
          select: {
            teacherId: true,
            room: true,
            subject: { select: { id: true, name: true } },
          },
        },
      },
    }),
    // Approved only. A pending request is a request, and a board that arranges
    // cover against one has granted leave nobody granted.
    // A day either side, then absentOn decides exactly: leave dates are
    // timestamps written as local midnight and this is a calendar day, which
    // are the same instant in Accra and a day apart west of Greenwich.
    db.staffLeave.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: addDays(date, 1) },
        endDate: { gte: addDays(date, -1) },
      },
      select: { staffId: true, startDate: true, endDate: true, leaveType: true },
    }),
    db.staff.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        title: true,
        firstName: true,
        lastName: true,
        department: true,
        specialisations: true,
        isTeaching: true,
      },
    }),
    db.coverAssignment.findMany({
      where: { date },
      select: { slotId: true, kind: true, coverStaffId: true, note: true },
    }),
  ]);

  const names = new Map(staff.map((person) => [person.id, fullName(person)]));

  const lessons: Lesson[] = slots.map((slot) => ({
    slotId: slot.id,
    dayOfWeek: slot.dayOfWeek,
    periodIndex: slot.periodIndex,
    startTime: slot.startTime,
    endTime: slot.endTime,
    staffId: slot.offering?.teacherId ?? null,
    subjectId: slot.offering?.subject.id ?? null,
    subject: slot.offering?.subject.name ?? "",
    className: `${slot.classSection.classLevel.name} ${slot.classSection.name}`,
    room: slot.room ?? slot.offering?.room ?? null,
  }));

  const absences: Absence[] = leaves.map((leave) => ({
    staffId: leave.staffId,
    from: dayOf(leave.startDate),
    to: dayOf(leave.endDate),
    reason: `${humanise(leave.leaveType)} leave`,
  }));

  const teachers: Teacher[] = staff.map((person) => ({
    staffId: person.id,
    name: fullName(person),
    department: person.department,
    specialisations: person.specialisations,
    isTeaching: person.isTeaching,
  }));

  const arrangements: Arrangement[] = rows.map((row) => ({
    slotId: row.slotId,
    kind: row.kind as CoverKind,
    coverStaffId: row.coverStaffId,
  }));

  const absent = absentOn(absences, date);
  const holes = periodsToCover(lessons, absent, date);
  const totals = summarise(holes, arrangements, absent);

  const decided = new Map(rows.map((row) => [row.slotId, row]));
  const board = slips(arrangements, lessons);
  const uncovered = holes.filter((lesson) => !decided.has(lesson.slotId));

  return (
    <>
      <PageHeader
        title="Cover"
        description={`${formatDate(date)}. Who stands in front of a class when the teacher is not there.`}
        action={
          <>
            <DayPicker date={day} />
            {mayArrange && uncovered.length > 0 ? (
              <AutoArrangeForm date={day} holes={uncovered.length} />
            ) : null}
          </>
        }
      />

      {isWeekend(date) ? (
        <Alert tone="info" className="mb-4">
          {formatDate(date)} is a weekend. Anything below is a Saturday class,
          which some schools here run and most do not.
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Teachers out"
          value={String(totals.out)}
          hint={totals.out ? "With lessons today" : "Everybody is in"}
          tone={totals.out ? "warning" : "success"}
          icon={<CalendarOff className="size-4" />}
        />
        <StatCard
          label="Periods affected"
          value={String(totals.affected)}
          hint="Lessons their absence leaves"
          tone="neutral"
          icon={<ClipboardList className="size-4" />}
        />
        <StatCard
          label="Arranged"
          value={String(totals.arranged)}
          hint={totals.lost ? `${totals.lost} written off` : "Somebody in the room"}
          tone="success"
          icon={<CheckCircle2 className="size-4" />}
        />
        <StatCard
          label="Nobody yet"
          value={String(totals.uncovered)}
          hint={totals.uncovered ? "Nobody has decided" : "Every period dealt with"}
          tone={totals.uncovered ? "danger" : "success"}
          icon={<AlertTriangle className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="The day"
              description={
                holes.length
                  ? "Every period whose teacher is away, in the order the day happens."
                  : "Nothing to arrange."
              }
            />
            <CardBody className="space-y-3">
              {holes.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 className="size-5" />}
                  title={absent.size ? "Nobody who is out was teaching" : "Nobody is out"}
                  description={
                    absent.size
                      ? "The staff on leave today have no lessons on the timetable."
                      : "No approved leave covers this day, so every class has its own teacher."
                  }
                />
              ) : (
                holes.map((lesson) => {
                  const current = decided.get(lesson.slotId) ?? null;
                  const candidates = rankCandidates(
                    lesson,
                    teachers,
                    lessons,
                    arrangements,
                    absent,
                  );

                  return (
                    <div
                      key={lesson.slotId}
                      className="rounded-xl border border-[var(--border)] p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {lesson.subject}, {lesson.className}
                          </p>
                          <p className="numeric text-xs text-[var(--text-subtle)]">
                            {lesson.startTime}-{lesson.endTime}
                            {lesson.room ? ` · ${lesson.room}` : ""}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                            {names.get(lesson.staffId ?? "") ?? "Unassigned"} ·{" "}
                            {absent.get(lesson.staffId ?? "")}
                          </p>
                        </div>

                        {current ? (
                          <div className="text-right">
                            <Badge tone={kindTone(current.kind)}>
                              {kindLabel(current.kind)}
                            </Badge>
                            {current.coverStaffId ? (
                              <p className="mt-1 text-sm font-medium">
                                {names.get(current.coverStaffId) ?? "Somebody"}
                              </p>
                            ) : null}
                            {current.note ? (
                              <p className="mt-0.5 max-w-xs text-xs text-[var(--text-subtle)]">
                                {current.note}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <Badge tone="danger">Nobody yet</Badge>
                        )}
                      </div>

                      {mayArrange ? (
                        <div className="mt-3">
                          <ArrangeForm
                            date={day}
                            slotId={lesson.slotId}
                            candidates={candidates}
                            current={
                              current
                                ? {
                                    kind: current.kind,
                                    coverStaffId: current.coverStaffId,
                                    note: current.note,
                                  }
                                : null
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Who is out"
              description="Read from approved leave, not stored here."
            />
            <CardBody className="space-y-2">
              {absent.size === 0 ? (
                <EmptyState
                  icon={<UserX className="size-5" />}
                  title="A full staff room"
                  description="Nobody has approved leave covering this day."
                />
              ) : (
                [...absent.entries()].map(([staffId, reason]) => {
                  const periods = lessons.filter(
                    (lesson) => lesson.staffId === staffId,
                  ).length;

                  return (
                    <div
                      key={staffId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {names.get(staffId) ?? "A member of staff"}
                        </p>
                        <p className="text-xs text-[var(--text-subtle)]">{reason}</p>
                      </div>
                      <Badge tone={periods ? "warning" : "neutral"}>
                        {periods} {periods === 1 ? "period" : "periods"}
                      </Badge>
                    </div>
                  );
                })
              )}

              <p className="pt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                Somebody missing from this list who should be on it has leave
                that was never approved.{" "}
                <Link href="/leave" className="underline">
                  Leave
                </Link>{" "}
                is where that is fixed, and fixing it there fixes it here.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Cover slips"
              description="The same day the way each person reads it."
            />
            <CardBody className="space-y-2">
              {board.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList className="size-5" />}
                  title="Nobody is covering anything"
                  description="Arranged cover appears here, grouped by whoever is taking it."
                />
              ) : (
                board.map((slip) => (
                  <div
                    key={slip.staffId}
                    className="rounded-xl border border-[var(--border)] p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate font-medium">
                        {names.get(slip.staffId) ?? "A member of staff"}
                      </p>
                      <Badge tone={slip.periods.length > 2 ? "warning" : "neutral"}>
                        {slip.periods.length}
                      </Badge>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {slip.periods.map(({ lesson, kind }) => (
                        <li
                          key={lesson.slotId}
                          className="text-xs leading-relaxed text-[var(--text-subtle)]"
                        >
                          <span className="numeric">{lesson.startTime}</span>{" "}
                          {lesson.className}, {lesson.subject}
                          {kind === "TEACHER" ? "" : ` · ${kindLabel(kind)}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
        A free period is not free time. It is when marking, preparation and
        seeing a parent happen, so the list offers the person with room for the
        lesson rather than the first name in the register, and says out loud
        when somebody is being asked for a third time today.
      </p>
    </>
  );
}
