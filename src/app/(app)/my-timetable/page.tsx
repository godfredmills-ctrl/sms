import type { Metadata } from "next";
import { AlertTriangle, BookOpen, CalendarClock, Printer, School } from "lucide-react";

import {
  Alert,
  Card,
  CardBody,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { taughtBy } from "@/lib/scope";

export const metadata: Metadata = { title: "My timetable" };
export const dynamic = "force-dynamic";

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
];

/**
 * The signed-in teacher's own week.
 *
 * The timetable module has always answered "what happens in JHS 2 Amber on
 * Tuesday" — a class-shaped question. A teacher's question is shaped the
 * other way: "where am I at ten o'clock", across every class they teach.
 * Until this page, answering it meant opening each class grid in turn and
 * picking out their own name.
 *
 * No permission beyond being staff: this is the viewer's own diary, scoped
 * by the session's staffId, and it shows nobody else's. It deliberately
 * lives OUTSIDE /academics — that segment's layout demands
 * academic.structure.read, and a nurse who covers two first-aid lessons has
 * a timetable without having the academics module.
 */
export default async function MyTimetablePage() {
  const user = await requireUser();

  if (!user.staffId) {
    return (
      <>
        <PageHeader title="My timetable" />
        <Card>
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="No staff record linked"
            description="Your account is not linked to a staff record, so there is no timetable to show."
          />
        </Card>
      </>
    );
  }

  const slots = await db.timetableSlot.findMany({
    where: { offering: taughtBy(user.staffId ?? "") },
    // startTime is a zero-padded "HH:MM", so string order is time order.
    // periodIndex is NOT a school-wide clock — each class numbers its own
    // periods, and two classes' bell schedules are free to differ.
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }, { periodIndex: "asc" }],
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
          room: true,
          subject: { select: { name: true, colour: true } },
        },
      },
    },
  });

  // A teacher booked in two places at once is the timetable's worst bug,
  // and this page is where the person it happens to would actually see it.
  // Compared by actual times, not period numbers: periodIndex only means
  // something within one class, and two classes' bell schedules can differ —
  // JHS 1's period 2 can overlap JHS 2's period 3 on the clock while never
  // sharing an index.
  const minutes = (time: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const clashKeys = new Set<string>();
  let clashPairs = 0;
  for (let a = 0; a < slots.length; a += 1) {
    for (let b = a + 1; b < slots.length; b += 1) {
      const one = slots[a];
      const two = slots[b];
      if (one.dayOfWeek !== two.dayOfWeek) continue;
      const oneStart = minutes(one.startTime);
      const oneEnd = minutes(one.endTime);
      const twoStart = minutes(two.startTime);
      const twoEnd = minutes(two.endTime);
      if (oneStart === null || oneEnd === null || twoStart === null || twoEnd === null)
        continue;
      if (oneStart < twoEnd && twoStart < oneEnd) {
        clashKeys.add(one.id);
        clashKeys.add(two.id);
        clashPairs += 1;
      }
    }
  }

  const classes = new Set(
    slots.map((slot) => `${slot.classSection.classLevel.name} ${slot.classSection.name}`),
  );
  const subjects = new Set(slots.map((slot) => slot.offering?.subject.name).filter(Boolean));

  // JS Sunday-first day → the schema's Monday-first numbering.
  const jsDay = new Date().getDay();
  const today = jsDay === 0 ? 7 : jsDay;

  return (
    <>
      <PageHeader
        title="My timetable"
        description="Your own week, across every class you teach."
        action={
          slots.length ? (
            <LinkButton
              href="/api/timetable-pdf?kind=mine"
              target="_blank"
              variant="outline"
              size="sm"
            >
              <Printer className="size-4" />
              Print
            </LinkButton>
          ) : undefined
        }
      />

      {slots.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="No lessons on the grid"
            description="When the timetable assigns you lessons, your week appears here."
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Lessons a week"
              value={slots.length}
              tone="violet"
              icon={<CalendarClock className="size-4" />}
            />
            <StatCard
              label="Classes"
              value={classes.size}
              tone="info"
              icon={<School className="size-4" />}
            />
            <StatCard
              label="Subjects"
              value={subjects.size}
              tone="teal"
              icon={<BookOpen className="size-4" />}
            />
            <StatCard
              label="Clashes"
              value={clashPairs}
              hint={clashPairs ? "Two classes at the same time" : "None"}
              tone={clashPairs ? "danger" : "success"}
              icon={<AlertTriangle className="size-4" />}
            />
          </div>

          {clashPairs ? (
            <Alert tone="danger" className="mb-4">
              You are booked in two classes at the same time: the affected lessons
              are outlined below. Tell whoever keeps the timetable before week one
              decides it for you.
            </Alert>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-5">
            {DAYS.map((day) => {
              const dayslots = slots.filter((slot) => slot.dayOfWeek === day.value);
              const isToday = day.value === today;

              return (
                <Card
                  key={day.value}
                  className={isToday ? "ring-2 ring-[var(--primary)]" : undefined}
                >
                  <div className="border-b border-[var(--border)] px-4 py-2.5">
                    <p className="text-sm font-semibold">
                      {day.label}
                      {isToday ? (
                        <span className="ml-1.5 text-xs font-normal text-[var(--primary)]">
                          today
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <CardBody className="space-y-1.5 p-3">
                    {dayslots.length ? (
                      dayslots.map((slot) => (
                        <div
                          key={slot.id}
                          className={`rounded-lg border p-2 text-xs ${
                            clashKeys.has(slot.id)
                              ? "border-[var(--danger)] ring-1 ring-[var(--danger)]"
                              : "border-[var(--border)]"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {slot.offering?.subject.colour ? (
                              <span
                                aria-hidden
                                className="size-2 shrink-0 rounded-full"
                                style={{ background: slot.offering.subject.colour }}
                              />
                            ) : null}
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {slot.classSection.classLevel.name}{" "}
                              {slot.classSection.name}
                            </span>
                          </div>
                          <p className="truncate text-[10px] text-[var(--text-muted)]">
                            {slot.offering?.subject.name ?? "-"}
                          </p>
                          <p className="numeric mt-0.5 text-[10px] text-[var(--text-subtle)]">
                            {slot.startTime}-{slot.endTime}
                            {slot.room ?? slot.offering?.room
                              ? ` · ${slot.room ?? slot.offering?.room}`
                              : ""}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="py-4 text-center text-xs text-[var(--text-subtle)]">
                        Free day
                      </p>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
