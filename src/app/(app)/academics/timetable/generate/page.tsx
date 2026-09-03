import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Clock, Users } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { currentTerm, termFilter } from "@/lib/current-term";
import { db } from "@/lib/db";
import {
  DEFAULT_PERIODS,
  ceiling,
  periodProblems,
  teachable,
  teacherPressure,
  type Demand,
  type Period,
} from "@/lib/timetable-rules";
import { fullName } from "@/lib/utils";

import { GenerateForm, PeriodsTable } from "./generate-forms";

export const metadata: Metadata = { title: "Build the timetable" };
export const dynamic = "force-dynamic";

/**
 * The generator, and the numbers it needs before it can run.
 *
 * The two halves are on one page on purpose. A school arriving here for the
 * first time has not told the system how many periods a week anything gets,
 * and a Generate button that answers "nothing to place" without showing what
 * is missing is a button that gets pressed twice and then abandoned.
 */
export default async function GenerateTimetablePage() {
  await requirePermission("academic.timetable.manage");

  const term = await currentTerm();
  const year = term.academicYearId;

  const [levels, offerings, periodRows, unavailable, slotCount] = await Promise.all([
    db.classLevel.findMany({
      orderBy: { sequence: "asc" },
      select: { id: true, name: true, _count: { select: { sections: true } } },
    }),
    year
      ? db.subjectOffering.findMany({
          where: { isActive: true, ...termFilter(term) },
          orderBy: [
            { classSection: { classLevel: { sequence: "asc" } } },
            { classSection: { name: "asc" } },
            { subject: { name: "asc" } },
          ],
          select: {
            id: true,
            periodsPerWeek: true,
            doublePeriods: true,
            subject: { select: { name: true } },
            teacherId: true,
            coTeacherIds: true,
            teacher: { select: { firstName: true, lastName: true, title: true } },
            classSection: {
              select: {
                id: true,
                name: true,
                classLevel: { select: { id: true, name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    db.timetablePeriod.findMany({ orderBy: { periodIndex: "asc" } }),
    db.staffUnavailability.findMany({
      select: {
        staffId: true,
        dayOfWeek: true,
        periodIndex: true,
        staff: { select: { firstName: true, lastName: true, title: true } },
      },
    }),
    db.timetableSlot.count({ where: { offeringId: { not: null } } }),
  ]);

  const periods: Period[] = periodRows.length ? periodRows : DEFAULT_PERIODS;
  const problems = periodProblems(periods);

  const wanted = offerings.reduce((sum, offering) => sum + offering.periodsPerWeek, 0);
  const unset = offerings.filter((offering) => offering.periodsPerWeek === 0).length;

  // What the week physically holds: teachable periods, five days, per class.
  const capacityPerClass = teachable(periods).length * 5;
  const sectionCount = new Set(offerings.map((o) => o.classSection.id)).size;

  /*
   * Who is being asked for more than a week holds.
   *
   * The most useful thing on this page, and the thing that stops a school
   * blaming the generator for arithmetic. A half-filled timetable looks like
   * software failing; nine times in ten it is a school with six teachers and
   * twenty-one classes, where the busiest is wanted for a hundred and fifteen
   * periods in a week that has forty-five. No arrangement of anything fixes
   * that, and the only useful thing to do is say so by name.
   */
  const demands: Demand[] = offerings
    .filter((offering) => offering.periodsPerWeek > 0)
    .map((offering) => ({
      offeringId: offering.id,
      classSectionId: offering.classSection.id,
      staffIds: [offering.teacherId, ...offering.coTeacherIds].filter(
        (id): id is string => Boolean(id),
      ),
      periodsPerWeek: offering.periodsPerWeek,
      doublePeriods: offering.doublePeriods,
    }));

  const unavailableRules = unavailable.map((rule) => ({
    staffId: rule.staffId,
    dayOfWeek: rule.dayOfWeek,
    periodIndex: rule.periodIndex,
  }));

  const pressure = teacherPressure(demands, periods, [1, 2, 3, 4, 5], unavailableRules);
  const overloaded = pressure.filter((entry) => entry.impossible);
  const possible = ceiling(demands, periods, [1, 2, 3, 4, 5], unavailableRules);

  const staffNames = new Map<string, string>();
  for (const rule of unavailable) staffNames.set(rule.staffId, fullName(rule.staff));
  for (const offering of offerings) {
    if (offering.teacherId && offering.teacher) {
      staffNames.set(offering.teacherId, fullName(offering.teacher));
    }
  }

  return (
    <>
      <PageHeader
        title="Build the timetable"
        description={
          year
            ? `${term.yearName}${term.termName ? `, ${term.termName}` : ""}. Nothing already on the timetable is moved.`
            : "There is no current academic year."
        }
        breadcrumb={
          <Link href="/academics/timetable" className="hover:text-[var(--text)]">
            Timetable
          </Link>
        }
      />

      {!year ? (
        <Alert tone="warning">
          Set a current academic year under Years and terms before building a
          timetable.
        </Alert>
      ) : null}

      {problems.length ? (
        <Alert tone="danger" className="mb-4">
          <span className="block font-medium">
            The bell schedule has to be fixed before anything can be placed.
          </span>
          {problems.map((problem) => (
            <span key={problem} className="block">
              {problem}
            </span>
          ))}
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Periods wanted"
          value={wanted.toLocaleString()}
          hint={`${sectionCount} classes, ${capacityPerClass} slots each a week`}
          tone="violet"
          icon={<CalendarClock className="size-4" />}
        />
        <StatCard
          label="Already placed"
          value={slotCount.toLocaleString()}
          hint="Kept, not moved"
          tone="info"
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Subjects with no time set"
          value={unset.toLocaleString()}
          hint={unset ? "The generator will skip these" : "Every subject has a figure"}
          tone={unset ? "warning" : "success"}
          icon={<AlertTriangle className="size-4" />}
        />
        <StatCard
          label="Staff with time off"
          value={unavailable.length.toLocaleString()}
          hint="Respected when placing"
          tone="teal"
          icon={<Users className="size-4" />}
        />
      </div>

      {wanted > capacityPerClass * Math.max(1, sectionCount) ? (
        <Alert tone="warning" className="mb-4">
          The subjects here want more periods than the classrooms physically hold.
          Some will not be placed whatever order they are tried in. Reduce the
          periods a week, or add periods to the bell schedule.
        </Alert>
      ) : null}

      {overloaded.length ? (
        <Alert tone="danger" className="mb-4">
          <span className="block font-medium">
            {overloaded.length}{" "}
            {overloaded.length === 1 ? "teacher is" : "teachers are"} being asked for
            more than a week holds. At most {possible.toLocaleString()} of the{" "}
            {wanted.toLocaleString()} periods can be placed.
          </span>
          <span className="mb-2 block">
            This is arithmetic rather than a limit of the builder. No arrangement of
            anything fits a week that has already been over-committed, so the answer
            is more teaching staff, fewer periods a week, or a longer day.
          </span>
          <span className="block space-y-0.5">
            {overloaded.slice(0, 8).map((entry) => (
              <span key={entry.staffId} className="block text-sm">
                {staffNames.get(entry.staffId) ?? "A teacher"} is wanted for{" "}
                <span className="numeric font-medium">{entry.wanted}</span> periods and
                can teach <span className="numeric font-medium">{entry.capacity}</span>
                .
              </span>
            ))}
            {overloaded.length > 8 ? (
              <span className="block text-sm">
                and {overloaded.length - 8} more.
              </span>
            ) : null}
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader
            title="Run it"
            description="Places every subject that has a number of periods a week set."
          />
          <CardBody>
            <GenerateForm
              levels={levels
                .filter((level) => level._count.sections > 0)
                .map((level) => ({ value: level.id, label: level.name }))}
              disabled={!year || problems.length > 0}
            />

            <div className="mt-4 space-y-2 text-xs leading-relaxed text-[var(--text-muted)]">
              <p>
                A teacher is never put in two rooms at once, a class never in two
                lessons, and a room never booked twice. The result is checked for
                clashes before any of it is saved, and if it finds one it saves
                nothing.
              </p>
              <p>
                Breaks, assembly and anything you have labelled by hand are left
                exactly where they are, even when you ask it to replace.
              </p>
              <p>
                Run it twice on the same data and you get the same timetable. That
                is deliberate: a generator nobody can reproduce is one nobody can
                tell they have improved.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Periods a week"
            description="The one number the generator cannot work without."
          />
          <CardBody>
            {offerings.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No subjects are assigned to any class yet. Assign them under Classes
                and subjects first.
              </p>
            ) : (
              <PeriodsTable
                rows={offerings.map((offering) => ({
                  id: offering.id,
                  subject: offering.subject.name,
                  section: `${offering.classSection.classLevel.name} ${offering.classSection.name}`,
                  teacher: offering.teacher ? fullName(offering.teacher) : null,
                  periodsPerWeek: offering.periodsPerWeek,
                  doublePeriods: offering.doublePeriods,
                }))}
              />
            )}
          </CardBody>
        </Card>
      </div>

      {unavailable.length ? (
        <Card className="mt-4">
          <CardHeader
            title="When staff cannot teach"
            description="Set on a member of staff's own record. The generator will not place them at these times."
          />
          <CardBody className="flex flex-wrap gap-2">
            {unavailable.map((rule, index) => (
              <Badge key={index} tone="neutral">
                {fullName(rule.staff)}:{" "}
                {["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][rule.dayOfWeek]}
                {rule.periodIndex ? ` period ${rule.periodIndex}` : ", all day"}
              </Badge>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
