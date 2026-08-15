import type { Metadata } from "next";
import { CalendarClock, Coffee } from "lucide-react";

import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";

import { NotLinked } from "../not-linked";

export const metadata: Metadata = { title: "My Timetable" };
export const dynamic = "force-dynamic";

const DAYS = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
];

export default async function StudentTimetablePage() {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked title="My Timetable" />;

  const enrolment = await db.enrollment.findFirst({
    where: { studentId: user.studentId, status: "ACTIVE" },
    select: {
      classSection: {
        select: { id: true, name: true, classLevel: { select: { name: true } } },
      },
    },
  });

  const slots = enrolment
    ? await db.timetableSlot.findMany({
        where: { classSectionId: enrolment.classSection.id },
        orderBy: [{ dayOfWeek: "asc" }, { periodIndex: "asc" }],
        include: {
          offering: {
            select: {
              room: true,
              subject: { select: { name: true, colour: true } },
              teacher: { select: { firstName: true, lastName: true, title: true } },
            },
          },
        },
      })
    : [];

  // Today first on small screens: the day you actually need is the one you
  // should not have to scroll to.
  const today = new Date().getDay();

  if (!enrolment) {
    return (
      <>
        <PageHeader title="My timetable" />
        <Card>
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="Not enrolled in a class"
            description="A timetable appears once you are placed in a class."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My timetable"
        description={`${enrolment.classSection.classLevel.name} ${enrolment.classSection.name}`}
      />

      {slots.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="No timetable published"
            description="Your class timetable has not been built yet."
          />
        </Card>
      ) : (
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
                          slot.isBreak
                            ? "border-dashed border-[var(--border-strong)] bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                            : "border-[var(--border)]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {slot.offering?.subject.colour && !slot.isBreak ? (
                            <span
                              aria-hidden
                              className="size-2 shrink-0 rounded-full"
                              style={{ background: slot.offering.subject.colour }}
                            />
                          ) : slot.isBreak ? (
                            <Coffee className="size-3 shrink-0" />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {slot.label ?? slot.offering?.subject.name ?? "Free"}
                          </span>
                        </div>
                        <p className="numeric mt-0.5 text-[10px] text-[var(--text-subtle)]">
                          {slot.startTime}–{slot.endTime}
                        </p>
                        {slot.offering?.teacher ? (
                          <p className="truncate text-[10px] text-[var(--text-subtle)]">
                            {fullName(slot.offering.teacher)}
                          </p>
                        ) : null}
                        {slot.room ?? slot.offering?.room ? (
                          <p className="truncate text-[10px] text-[var(--text-subtle)]">
                            {slot.room ?? slot.offering?.room}
                          </p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-center text-xs text-[var(--text-subtle)]">
                      No lessons
                    </p>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
