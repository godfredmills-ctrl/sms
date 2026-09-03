"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { currentTerm, termFilter } from "@/lib/current-term";
import { db } from "@/lib/db";
import {
  DEFAULT_PERIODS,
  allClashes,
  generateTimetable,
  periodProblems,
  type Demand,
  type Period,
  type Placement,
} from "@/lib/timetable-rules";

export type GenerateState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** What could not be fitted, so the message can name it rather than count it. */
  shortfalls?: Array<{ label: string; wanted: number; placed: number }>;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Builds a timetable for a whole year group, or for the whole school.
 *
 * Writes nothing until it has a result with no clashes in it. The generator is
 * a heuristic and heuristics have bad days; a run that produced a double
 * booking and saved it anyway would be worse than no generator, because
 * somebody would trust it.
 *
 * What is already on the timetable is respected and never moved. A school that
 * has hand-built its assembly, its worship period and Monday morning gets the
 * rest filled in around them.
 */
export async function generateTimetableAction(
  _previous: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  let user;
  try {
    user = await authorize("academic.timetable.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const scope = text(formData, "scope"); // a classLevelId, or "all"
  const replace = formData.get("replace") === "on";

  // An offering exists per term; a timetable slot belongs to a class section
  // and a time. Without scoping to one term the same subject is demanded three
  // times over and the week is asked for three times the work.
  const term = await currentTerm();
  if (!term.academicYearId) return { error: "There is no current academic year." };

  const periodRows = await db.timetablePeriod.findMany({
    orderBy: { periodIndex: "asc" },
  });
  const periods: Period[] = periodRows.length ? periodRows : DEFAULT_PERIODS;

  // A broken bell schedule makes every downstream answer wrong in a way that
  // is hard to see: a period whose times do not parse stops clashing with
  // anything at all.
  const problems = periodProblems(periods);
  if (problems.length) {
    return {
      error: `The bell schedule has to be fixed first. ${problems[0]}`,
    };
  }

  const sections = await db.classSection.findMany({
    where: {
      isActive: true,
      ...(scope && scope !== "all" ? { classLevelId: scope } : {}),
    },
    select: { id: true },
  });
  if (!sections.length) return { error: "There are no classes to timetable." };

  const sectionIds = sections.map((section) => section.id);

  const offerings = await db.subjectOffering.findMany({
    where: {
      classSectionId: { in: sectionIds },
      isActive: true,
      periodsPerWeek: { gt: 0 },
      ...termFilter(term),
    },
    select: {
      id: true,
      classSectionId: true,
      teacherId: true,
      coTeacherIds: true,
      room: true,
      periodsPerWeek: true,
      doublePeriods: true,
      subject: { select: { name: true } },
      classSection: {
        select: { name: true, classLevel: { select: { name: true } } },
      },
    },
  });

  if (!offerings.length) {
    return {
      error:
        "No subject in these classes has been given a number of periods a week. Set that on Classes and subjects first: without it there is nothing to place.",
    };
  }

  const demands: Demand[] = offerings.map((offering) => ({
    offeringId: offering.id,
    classSectionId: offering.classSectionId,
    staffIds: [offering.teacherId, ...offering.coTeacherIds].filter(
      (id): id is string => Boolean(id),
    ),
    periodsPerWeek: offering.periodsPerWeek,
    doublePeriods: offering.doublePeriods,
    room: offering.room,
    label: `${offering.subject.name}, ${offering.classSection.classLevel.name} ${offering.classSection.name}`,
  }));

  const unavailable = await db.staffUnavailability.findMany({
    select: { staffId: true, dayOfWeek: true, periodIndex: true },
  });

  // Everything already on the timetable. The slots being replaced are dropped
  // from this set, and everything else, including other year groups, is a
  // constraint the generator has to work around.
  const existing = await db.timetableSlot.findMany({
    select: {
      id: true,
      classSectionId: true,
      dayOfWeek: true,
      periodIndex: true,
      startTime: true,
      endTime: true,
      room: true,
      offeringId: true,
      isBreak: true,
      offering: { select: { teacherId: true, coTeacherIds: true } },
    },
  });

  const beingReplaced = new Set(
    replace
      ? existing
          .filter(
            (slot) =>
              sectionIds.includes(slot.classSectionId) &&
              // A break, an assembly or a labelled period is the school's own
              // arrangement of its day and is never thrown away by a
              // generator, whatever the person clicking asked for.
              !slot.isBreak &&
              slot.offeringId !== null,
          )
          .map((slot) => slot.id)
      : [],
  );

  const fixed: Placement[] = existing
    .filter((slot) => !beingReplaced.has(slot.id))
    .map((slot) => ({
      id: slot.id,
      classSectionId: slot.classSectionId,
      dayOfWeek: slot.dayOfWeek,
      periodIndex: slot.periodIndex,
      startTime: slot.startTime,
      endTime: slot.endTime,
      offeringId: slot.offeringId,
      room: slot.room,
      staffIds: slot.offering
        ? [slot.offering.teacherId, ...slot.offering.coTeacherIds].filter(
            (id): id is string => Boolean(id),
          )
        : [],
    }));

  const result = generateTimetable({
    demands,
    periods,
    days: [1, 2, 3, 4, 5],
    unavailable,
    fixed,
  });

  // The check that makes this safe to write. The generator asserts it and this
  // does not take its word for it: a clash saved is a clash somebody discovers
  // when two classes turn up for the same teacher.
  const withIds = [...fixed, ...result.placements].map((placement, index) => ({
    ...placement,
    id: placement.id ?? `new-${index}`,
  }));
  const clashes = allClashes(withIds);
  if (clashes.size) {
    return {
      error: `The generator produced ${clashes.size} clash${clashes.size === 1 ? "" : "es"} and nothing has been saved. This is a fault worth reporting.`,
    };
  }

  await db.$transaction([
    ...(beingReplaced.size
      ? [db.timetableSlot.deleteMany({ where: { id: { in: [...beingReplaced] } } })]
      : []),
    db.timetableSlot.createMany({
      data: result.placements.map((placement) => ({
        classSectionId: placement.classSectionId,
        dayOfWeek: placement.dayOfWeek,
        periodIndex: placement.periodIndex,
        startTime: placement.startTime,
        endTime: placement.endTime,
        offeringId: placement.offeringId,
        room: placement.room,
        isBreak: false,
      })),
      skipDuplicates: true,
    }),
  ]);

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "academic.timetable.generate",
      entity: "ClassSection",
      entityId: scope || "all",
      summary: `${result.placed} of ${result.wanted} periods placed across ${sections.length} classes`,
    },
  });

  revalidatePath("/academics/timetable");
  revalidatePath("/academics/timetable/generate");
  revalidatePath("/my-timetable");

  return {
    ok: true,
    message:
      result.shortfalls.length === 0
        ? `${result.placed} periods placed across ${sections.length} ${sections.length === 1 ? "class" : "classes"}. Every subject got the time it asked for.`
        : `${result.placed} of ${result.wanted} periods placed. ${result.shortfalls.length} ${result.shortfalls.length === 1 ? "subject" : "subjects"} could not be fitted in full.`,
    shortfalls: result.shortfalls.map((row) => ({
      label: row.label,
      wanted: row.wanted,
      placed: row.placed,
    })),
  };
}

/**
 * Sets how much of the week a subject gets.
 *
 * On its own screen rather than in the offering form, because it is the one
 * number the generator cannot work without and a school setting up for the
 * first time needs to go through every subject in one sitting.
 */
export async function setPeriodsPerWeekAction(
  _previous: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  try {
    await authorize("academic.timetable.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const offeringId = text(formData, "offeringId");
  if (!offeringId) return { error: "No subject given." };

  const periodsPerWeek = Number(text(formData, "periodsPerWeek") || "0");
  const doublePeriods = Number(text(formData, "doublePeriods") || "0");

  if (!Number.isInteger(periodsPerWeek) || periodsPerWeek < 0 || periodsPerWeek > 50) {
    return { error: "Periods a week has to be a whole number, and a plausible one." };
  }
  if (!Number.isInteger(doublePeriods) || doublePeriods < 0) {
    return { error: "Double periods has to be a whole number." };
  }
  if (doublePeriods > periodsPerWeek) {
    return {
      error:
        "Doubles are counted in periods and come out of the weekly total, so there cannot be more of them than there are periods.",
    };
  }
  if (doublePeriods % 2 !== 0) {
    return { error: "Doubles are placed in pairs, so the number has to be even." };
  }

  await db.subjectOffering.update({
    where: { id: offeringId },
    data: { periodsPerWeek, doublePeriods },
  });

  revalidatePath("/academics/timetable/generate");
  return { ok: true, message: "Saved." };
}
