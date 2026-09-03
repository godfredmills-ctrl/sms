import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Clock, Printer, Wand2 } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentTerm, termFilter } from "@/lib/current-term";
import { classSectionScopeFilter } from "@/lib/scope";
import { DEFAULT_PERIODS, allClashes, type Placement } from "@/lib/timetable-rules";
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

  // A teacher sees their own classes' timetables. Their own week is a
  // different page (/my-timetable) and is not affected by this.
  const sections = await db.classSection.findMany({
    where: { isActive: true, ...(await classSectionScopeFilter(user)) },
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

  // An offering exists once per term. Without this the "not yet timetabled"
  // list showed every subject once for each term of the year.
  const term = await currentTerm();

  const [slots, offerings, otherSlots, periodRows] = await Promise.all([
    db.timetableSlot.findMany({
      where: { classSectionId: sectionId },
      orderBy: [{ dayOfWeek: "asc" }, { periodIndex: "asc" }],
      include: {
        offering: {
          select: {
            id: true,
            teacherId: true,
            coTeacherIds: true,
            subject: { select: { name: true, colour: true } },
            teacher: { select: { firstName: true, lastName: true, title: true } },
          },
        },
      },
    }),
    db.subjectOffering.findMany({
      where: { classSectionId: sectionId, isActive: true, ...termFilter(term) },
      select: {
        id: true,
        subject: { select: { name: true, code: true } },
        teacher: { select: { firstName: true, lastName: true, title: true } },
      },
    }),
    // Every other class's slots, so a teacher booked in two rooms at once is
    // caught here rather than on the first morning of term.
    db.timetableSlot.findMany({
      where: {
        classSectionId: { not: sectionId },
        offering: {
          OR: [{ teacherId: { not: null } }, { coTeacherIds: { isEmpty: false } }],
        },
      },
      select: {
        id: true,
        classSectionId: true,
        dayOfWeek: true,
        periodIndex: true,
        startTime: true,
        endTime: true,
        room: true,
        offeringId: true,
        offering: { select: { teacherId: true, coTeacherIds: true } },
        classSection: {
          select: { name: true, classLevel: { select: { name: true } } },
        },
      },
    }),
    // The school's bell schedule. Falls back to the built-in day only when
    // nobody has set one up, so a fresh install still draws a grid.
    db.timetablePeriod.findMany({ orderBy: { periodIndex: "asc" } }),
  ]);

  const periods = periodRows.length ? periodRows : DEFAULT_PERIODS;

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

  /*
   * Clashes, from the module the write path also uses.
   *
   * This was forty lines here: co-teachers gathered, times parsed, overlaps
   * compared. All of it correct, and all of it invisible to the action that
   * saves a slot, which is why a clash could be created and then reported
   * rather than refused. One module now, so the grid and the save agree by
   * construction.
   */
  const placements: Placement[] = [
    ...slots.map((slot) => ({
      id: slot.id,
      classSectionId: sectionId,
      dayOfWeek: slot.dayOfWeek,
      periodIndex: slot.periodIndex,
      startTime: slot.startTime,
      endTime: slot.endTime,
      offeringId: slot.offeringId ?? null,
      room: slot.room,
      staffIds: slot.offering
        ? [slot.offering.teacherId, ...slot.offering.coTeacherIds].filter(
            (id): id is string => Boolean(id),
          )
        : [],
    })),
    ...otherSlots.map((slot) => ({
      id: slot.id,
      classSectionId: slot.classSectionId,
      dayOfWeek: slot.dayOfWeek,
      periodIndex: slot.periodIndex,
      startTime: slot.startTime,
      endTime: slot.endTime,
      offeringId: slot.offeringId ?? null,
      room: slot.room,
      staffIds: slot.offering
        ? [slot.offering.teacherId, ...slot.offering.coTeacherIds].filter(
            (id): id is string => Boolean(id),
          )
        : [],
    })),
  ];

  const namedBySlot = new Map<string, string>();
  for (const slot of otherSlots) {
    namedBySlot.set(
      slot.id,
      slot.classSection.classLevel.name + " " + slot.classSection.name,
    );
  }
  for (const slot of slots) {
    namedBySlot.set(slot.id, section.classLevel.name + " " + section.name);
  }

  const clashes: Record<string, string> = {};
  for (const [slotId, clash] of allClashes(placements)) {
    // Only this section is drawn, so only its cells need colouring.
    if (!slots.some((slot) => slot.id === slotId)) continue;
    clashes[slotId] = namedBySlot.get(clash.with.id ?? "") ?? "another class";
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
        action={
          <>
          {canEdit ? (
            <LinkButton
              href="/academics/timetable/generate"
              variant="outline"
              size="sm"
            >
              <Wand2 className="size-3.5" />
              Build it for me
            </LinkButton>
          ) : null}
          <LinkButton
            href={`/api/timetable-pdf?kind=class&sectionId=${sectionId}`}
            target="_blank"
            variant="outline"
            size="sm"
          >
            <Printer className="size-4" />
            Print
          </LinkButton>
          </>
        }
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
          cells are outlined below: a clash found now is a timetable fix; found in
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
            periods={periods}
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
