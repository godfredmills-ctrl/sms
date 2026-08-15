import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Clock } from "lucide-react";

import { Alert, Badge, Card, CardBody, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";

import { TimetableGrid, type Slot } from "./timetable-grid";

export const metadata: Metadata = { title: "Timetable" };
export const dynamic = "force-dynamic";

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await requirePermission("academic.timetable.read");
  const canEdit = userCan(user, "academic.timetable.manage");
  const { section: requested } = await searchParams;

  const sections = await db.classSection.findMany({
    where: { isActive: true },
    orderBy: [{ classLevel: { sequence: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      classLevel: { select: { name: true, sequence: true } },
    },
  });

  if (sections.length === 0) {
    return (
      <>
        <PageHeader title="Timetable" />
        <Card>
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="No classes yet"
            description="Create class sections before building a timetable."
          />
        </Card>
      </>
    );
  }

  const sectionId =
    sections.find((entry) => entry.id === requested)?.id ?? sections[0].id;
  const section = sections.find((entry) => entry.id === sectionId)!;

  const [slots, offerings, otherSlots] = await Promise.all([
    db.timetableSlot.findMany({
      where: { classSectionId: sectionId },
      orderBy: [{ dayOfWeek: "asc" }, { periodIndex: "asc" }],
      include: {
        offering: {
          select: {
            id: true,
            subject: { select: { name: true, colour: true } },
            teacher: { select: { firstName: true, lastName: true, title: true } },
          },
        },
      },
    }),
    db.subjectOffering.findMany({
      where: { classSectionId: sectionId, isActive: true },
      select: {
        id: true,
        subject: { select: { name: true, code: true } },
        teacher: { select: { firstName: true, lastName: true, title: true } },
      },
    }),
    // Every other class's slots, so a teacher booked in two rooms at once is
    // caught here rather than on the first morning of term.
    db.timetableSlot.findMany({
      where: { classSectionId: { not: sectionId }, offering: { teacherId: { not: null } } },
      select: {
        dayOfWeek: true,
        periodIndex: true,
        offering: { select: { teacherId: true } },
        classSection: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
      },
    }),
  ]);

  const rows: Slot[] = slots.map((slot) => ({
    id: slot.id,
    dayOfWeek: slot.dayOfWeek,
    periodIndex: slot.periodIndex,
    startTime: slot.startTime,
    endTime: slot.endTime,
    room: slot.room,
    label: slot.label,
    isBreak: slot.isBreak,
    offeringId: slot.offeringId,
    subject: slot.offering?.subject.name ?? null,
    subjectColour: slot.offering?.subject.colour ?? null,
    teacher: slot.offering?.teacher ? fullName(slot.offering.teacher) : null,
  }));

  const clashes: Record<string, string> = {};

  // Resolve teacher ids once, then look for a same-day, same-period booking.
  const teacherByOffering = new Map(
    (
      await db.subjectOffering.findMany({
        where: { id: { in: slots.map((slot) => slot.offeringId).filter(Boolean) as string[] } },
        select: { id: true, teacherId: true },
      })
    ).map((offering) => [offering.id, offering.teacherId]),
  );

  for (const slot of slots) {
    if (!slot.offeringId) continue;
    const teacherId = teacherByOffering.get(slot.offeringId);
    if (!teacherId) continue;

    const conflict = otherSlots.find(
      (other) =>
        other.dayOfWeek === slot.dayOfWeek &&
        other.periodIndex === slot.periodIndex &&
        other.offering?.teacherId === teacherId,
    );

    if (conflict) {
      clashes[slot.id] =
        `${conflict.classSection.classLevel.name} ${conflict.classSection.name}`;
    }
  }

  const taught = rows.filter((row) => row.offeringId && !row.isBreak).length;
  const unassigned = offerings.filter(
    (offering) => !rows.some((row) => row.offeringId === offering.id),
  );

  return (
    <>
      <PageHeader
        title="Timetable"
        description={`${section.classLevel.name} ${section.name}`}
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {sections.map((entry) => (
          <Link
            key={entry.id}
            href={`/academics/timetable?section=${entry.id}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              entry.id === sectionId
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            {entry.classLevel.name} {entry.name}
          </Link>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Periods scheduled"
          value={taught}
          tone="violet"
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Subjects assigned"
          value={offerings.length}
          hint={`${unassigned.length} not yet on the grid`}
          tone={unassigned.length ? "warning" : "success"}
        />
        <StatCard
          label="Teacher clashes"
          value={Object.keys(clashes).length}
          hint="Same teacher, two classes, one period"
          tone={Object.keys(clashes).length ? "danger" : "success"}
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard label="Breaks" value={rows.filter((row) => row.isBreak).length} tone="neutral" />
      </div>

      {Object.keys(clashes).length ? (
        <Alert tone="danger" className="mb-4">
          A teacher is booked in more than one class at the same time. The affected
          cells are outlined below — a clash found now is a timetable fix; found in
          week one it is a lesson nobody teaches.
        </Alert>
      ) : null}

      {unassigned.length ? (
        <Card className="mb-4">
          <CardBody className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--text-muted)]">Not yet timetabled:</span>
            {unassigned.map((offering) => (
              <Badge key={offering.id} tone="warning">
                {offering.subject.name}
              </Badge>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody>
          <TimetableGrid
            sectionId={sectionId}
            slots={rows}
            canEdit={canEdit}
            clashes={clashes}
            offerings={offerings.map((offering) => ({
              value: offering.id,
              label: offering.subject.name,
              description: offering.teacher
                ? fullName(offering.teacher)
                : "No teacher assigned",
            }))}
          />
        </CardBody>
      </Card>
    </>
  );
}
