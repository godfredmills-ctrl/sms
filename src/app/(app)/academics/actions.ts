"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { findClash, type Placement } from "@/lib/timetable-rules";
import { slugify } from "@/lib/utils";

export type AcademicState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function code(value: string): string {
  return slugify(value).toUpperCase().replace(/-/g, "");
}

// -----------------------------------------------------------------------------
// Class levels and sections
// -----------------------------------------------------------------------------

export async function createClassLevelAction(
  _previous: AcademicState,
  formData: FormData,
): Promise<AcademicState> {
  try {
    await authorize("academic.structure.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const name = text(formData, "name");
  if (!name) return { error: "Name the level." };

  const levelCode = text(formData, "code") || code(name);
  if (await db.classLevel.findUnique({ where: { code: levelCode } })) {
    return { error: `A level with code "${levelCode}" already exists.` };
  }

  const sequence = Number(text(formData, "sequence"));
  const last = await db.classLevel.findFirst({
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });

  await db.classLevel.create({
    data: {
      name,
      code: levelCode,
      // Sequence drives promotion: it decides which level a class moves up to
      // at the end of the year, so it must never collide or leave a hole.
      sequence: Number.isFinite(sequence) && sequence > 0
        ? sequence
        : (last?.sequence ?? 0) + 1,
      stage: text(formData, "stage") || null,
      curriculum: text(formData, "curriculum") || null,
    },
  });

  revalidatePath("/academics/classes");
  return { ok: true, message: `Added ${name}.` };
}

export async function createSectionAction(
  _previous: AcademicState,
  formData: FormData,
): Promise<AcademicState> {
  try {
    await authorize("academic.structure.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const classLevelId = text(formData, "classLevelId");
  const name = text(formData, "name");
  if (!classLevelId || !name) return { error: "Choose a level and name the class." };

  const level = await db.classLevel.findUnique({
    where: { id: classLevelId },
    select: { code: true },
  });
  if (!level) return { error: "That level no longer exists." };

  const sectionCode = text(formData, "code") || `${level.code}${code(name)}`;
  if (await db.classSection.findUnique({ where: { code: sectionCode } })) {
    return { error: `A class with code "${sectionCode}" already exists.` };
  }

  const capacity = Number(text(formData, "capacity"));

  await db.classSection.create({
    data: {
      classLevelId,
      name,
      code: sectionCode,
      stream: text(formData, "stream") || null,
      capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 30,
      roomName: text(formData, "roomName") || null,
      formTeacherId: text(formData, "formTeacherId") || null,
      assistantTeacherId: text(formData, "assistantTeacherId") || null,
    },
  });

  revalidatePath("/academics/classes");
  return { ok: true, message: `Created ${name}.` };
}

// -----------------------------------------------------------------------------
// Subjects
// -----------------------------------------------------------------------------

export async function createSubjectAction(
  _previous: AcademicState,
  formData: FormData,
): Promise<AcademicState> {
  try {
    await authorize("academic.structure.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const name = text(formData, "name");
  if (!name) return { error: "Name the subject." };

  const subjectCode = text(formData, "code") || code(name).slice(0, 8);
  if (await db.subject.findUnique({ where: { code: subjectCode } })) {
    return { error: `A subject with code "${subjectCode}" already exists.` };
  }

  const passMark = Number(text(formData, "passMark"));
  const last = await db.subject.findFirst({
    orderBy: { sortKey: "desc" },
    select: { sortKey: true },
  });

  await db.subject.create({
    data: {
      name,
      code: subjectCode,
      shortName: text(formData, "shortName") || null,
      department: text(formData, "department") || null,
      isCore: formData.get("isCore") === "on",
      isElective: formData.get("isElective") === "on",
      excludeFromAggregate: formData.get("excludeFromAggregate") === "on",
      passMark: Number.isFinite(passMark) ? passMark : 50,
      colour: text(formData, "colour") || null,
      sortKey: (last?.sortKey ?? 0) + 10,
    },
  });

  revalidatePath("/academics/subjects");
  return { ok: true, message: `Added ${name}.` };
}

export async function toggleSubjectAction(formData: FormData) {
  await authorize("academic.structure.manage");

  const id = text(formData, "id");
  if (!id) return;

  const subject = await db.subject.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!subject) return;

  await db.subject.update({ where: { id }, data: { isActive: !subject.isActive } });
  revalidatePath("/academics/subjects");
}

/**
 * Sets which levels teach a subject — the curriculum map. Rewritten wholesale
 * rather than diffed because the picker always posts the complete set.
 */
export async function setSubjectLevelsAction(formData: FormData) {
  await authorize("academic.structure.manage");

  const subjectId = text(formData, "subjectId");
  if (!subjectId) return;

  const levelIds = formData.getAll("levelIds").map(String).filter(Boolean);

  await db.$transaction([
    db.levelSubject.deleteMany({ where: { subjectId } }),
    db.levelSubject.createMany({
      data: levelIds.map((classLevelId) => ({ subjectId, classLevelId })),
      skipDuplicates: true,
    }),
  ]);

  revalidatePath("/academics/subjects");
}

// -----------------------------------------------------------------------------
// Academic years and terms
// -----------------------------------------------------------------------------

export async function createAcademicYearAction(
  _previous: AcademicState,
  formData: FormData,
): Promise<AcademicState> {
  try {
    await authorize("academic.year.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const name = text(formData, "name");
  const startDate = text(formData, "startDate");
  const endDate = text(formData, "endDate");
  if (!name || !startDate || !endDate) {
    return { error: "Name the year and give its start and end dates." };
  }
  if (new Date(endDate) <= new Date(startDate)) {
    return { error: "The year must end after it starts." };
  }

  const school = await db.school.findFirst({ select: { id: true } });
  if (!school) return { error: "No school record exists yet." };

  if (
    await db.academicYear.findFirst({
      where: { schoolId: school.id, name },
      select: { id: true },
    })
  ) {
    return { error: `${name} already exists.` };
  }

  const termCount = Math.min(Math.max(Number(text(formData, "terms")) || 3, 1), 4);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const span = (end.getTime() - start.getTime()) / termCount;

  await db.academicYear.create({
    data: {
      schoolId: school.id,
      name,
      startDate: start,
      endDate: end,
      // Terms are laid out evenly across the year as a starting point; the
      // school adjusts the boundaries afterwards. Creating a year with no
      // terms is worse — nothing can be invoiced, graded or timetabled.
      terms: {
        create: Array.from({ length: termCount }, (_, index) => ({
          name: `Term ${index + 1}`,
          sequence: index + 1,
          startDate: new Date(start.getTime() + span * index),
          endDate: new Date(start.getTime() + span * (index + 1) - 86_400_000),
        })),
      },
    },
  });

  revalidatePath("/academics/years");
  return { ok: true, message: `Created ${name} with ${termCount} terms.` };
}

export async function setCurrentYearAction(formData: FormData) {
  const user = await authorize("academic.year.manage");

  const id = text(formData, "id");
  if (!id) return;

  await db.$transaction([
    db.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } }),
    db.academicYear.update({ where: { id }, data: { isCurrent: true } }),
  ]);

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "academic.year.current",
      entity: "AcademicYear",
      entityId: id,
      summary: "Set the current academic year",
    },
  });

  revalidatePath("/academics/years");
}

export async function setCurrentTermAction(formData: FormData) {
  const user = await authorize("academic.year.manage");

  const id = text(formData, "id");
  if (!id) return;

  await db.$transaction([
    db.term.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } }),
    db.term.update({ where: { id }, data: { isCurrent: true } }),
  ]);

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "academic.term.current",
      entity: "Term",
      entityId: id,
      summary: "Set the current term",
    },
  });

  revalidatePath("/academics/years");
}

export async function updateTermAction(formData: FormData) {
  await authorize("academic.year.manage");

  const id = text(formData, "id");
  const startDate = text(formData, "startDate");
  const endDate = text(formData, "endDate");
  if (!id || !startDate || !endDate) return;
  if (new Date(endDate) <= new Date(startDate)) return;

  const resultsDue = text(formData, "resultsDueDate");

  await db.term.update({
    where: { id },
    data: {
      name: text(formData, "name") || undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      resultsDueDate: resultsDue ? new Date(resultsDue) : null,
    },
  });

  revalidatePath("/academics/years");
}

/**
 * Locking a term is what stops marks changing after reports are issued.
 * It is reversible by design — a genuine correction should be possible, but
 * it has to be a deliberate act that lands in the audit log.
 */
export async function toggleTermLockAction(formData: FormData) {
  const user = await authorize("academic.year.manage");

  const id = text(formData, "id");
  if (!id) return;

  const term = await db.term.findUnique({ where: { id }, select: { isLocked: true } });
  if (!term) return;

  await db.term.update({ where: { id }, data: { isLocked: !term.isLocked } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: term.isLocked ? "academic.term.unlock" : "academic.term.lock",
      entity: "Term",
      entityId: id,
      summary: term.isLocked ? "Unlocked a term for editing" : "Locked a term",
    },
  });

  revalidatePath("/academics/years");
}

// -----------------------------------------------------------------------------
// Offerings and timetable
// -----------------------------------------------------------------------------

export async function createOfferingAction(
  _previous: AcademicState,
  formData: FormData,
): Promise<AcademicState> {
  try {
    await authorize("academic.structure.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const classSectionId = text(formData, "classSectionId");
  const subjectId = text(formData, "subjectId");
  if (!classSectionId || !subjectId) return { error: "Choose a class and a subject." };

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true, terms: { where: { isCurrent: true }, select: { id: true } } },
  });
  if (!year) return { error: "Set a current academic year first." };

  // A term, or nothing. Defaulting to null when the year has no current term
  // made a row that is perfectly visible to the gradebook and invisible to
  // examinations, which filter on the session's term — a paper reporting "no
  // candidates are entered" when the whole year group was entered. The unique
  // constraint on (year, term, subject, section) does not constrain such rows
  // either, because Postgres reads NULLs as distinct, so they could also be
  // created twice over.
  const termId = text(formData, "termId") || year.terms[0]?.id || null;
  if (!termId) {
    return {
      error:
        "There is no current term, and a subject has to be taught in one. Set the term on the academic year first.",
    };
  }

  const teacherId = text(formData, "teacherId") || null;

  // A class takes a subject from one lead teacher and any number of others
  // alongside them — a lab assistant, a second set teacher, a trainee. The
  // lead is filtered out of the co-teacher list so nobody is counted twice
  // when the same name is picked in both boxes.
  const coTeacherIds = [
    ...new Set(
      formData
        .getAll("coTeacherIds")
        .map((value) => String(value).trim())
        .filter((value) => value && value !== teacherId),
    ),
  ];

  const existing = await db.subjectOffering.findFirst({
    where: { academicYearId: year.id, termId, subjectId, classSectionId },
    select: { id: true, coTeacherIds: true },
  });

  if (existing) {
    // The form is an assign box, not an edit form: it opens empty every time,
    // so an untouched co-teacher field means "I did not say", not "remove
    // them". Re-assigning a teacher to a class would otherwise silently drop
    // the lab assistant already recorded on it. Clearing is done by picking
    // the people who should remain.
    await db.subjectOffering.update({
      where: { id: existing.id },
      data: {
        teacherId,
        ...(coTeacherIds.length ? { coTeacherIds } : {}),
        isActive: true,
      },
    });
    revalidatePath("/academics/classes");
    return { ok: true, message: "Updated the existing assignment." };
  }

  await db.subjectOffering.create({
    data: {
      academicYearId: year.id,
      termId,
      subjectId,
      classSectionId,
      teacherId,
      coTeacherIds,
      room: text(formData, "room") || null,
    },
  });

  revalidatePath("/academics/classes");
  return { ok: true, message: "Subject assigned." };
}

/**
 * Writes one cell of a timetable, and refuses to double book anybody.
 *
 * The refusal is the point. The timetable page has always coloured a clashing
 * cell red, but the action that wrote the cell knew nothing about it, so the
 * clash was reported after it had been created. The proposal and the manual
 * both said the builder "refuses to double book a teacher" and it did not; it
 * complained. Both now use the same module, so the sentence is true.
 */
export async function saveTimetableSlotAction(
  _previous: AcademicState,
  formData: FormData,
): Promise<AcademicState> {
  try {
    await authorize("academic.timetable.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const classSectionId = text(formData, "classSectionId");
  const dayOfWeek = Number(text(formData, "dayOfWeek"));
  const periodIndex = Number(text(formData, "periodIndex"));
  if (!classSectionId || !Number.isFinite(dayOfWeek) || !Number.isFinite(periodIndex)) {
    return { error: "That is not a place on the timetable." };
  }

  const offeringId = text(formData, "offeringId") || null;
  const startTime = text(formData, "startTime");
  const endTime = text(formData, "endTime");

  // An empty subject clears the slot rather than storing a blank period, so
  // free periods look free instead of looking like a data-entry mistake.
  if (!offeringId && !text(formData, "label")) {
    await db.timetableSlot.deleteMany({
      where: { classSectionId, dayOfWeek, periodIndex },
    });
    revalidatePath("/academics/timetable");
    return { ok: true, message: "Cleared." };
  }

  const room = text(formData, "room") || null;
  const isBreak = formData.get("isBreak") === "on";

  // The row this is replacing, so putting a subject where a subject already is
  // does not read as that class clashing with itself.
  const replacing = await db.timetableSlot.findUnique({
    where: {
      classSectionId_dayOfWeek_periodIndex: { classSectionId, dayOfWeek, periodIndex },
    },
    select: { id: true },
  });

  // A break period books nobody and nothing, so it cannot clash with anything.
  if (offeringId && !isBreak) {
    const offering = await db.subjectOffering.findUnique({
      where: { id: offeringId },
      select: {
        teacherId: true,
        coTeacherIds: true,
        subject: { select: { name: true } },
      },
    });
    if (!offering) return { error: "That subject is not taught in this class." };

    const staffIds = [offering.teacherId, ...offering.coTeacherIds].filter(
      (id): id is string => Boolean(id),
    );

    // Everything on that day, across every class, because a teacher belongs to
    // the school rather than to the section whose grid is being edited.
    const sameDay = await db.timetableSlot.findMany({
      where: { dayOfWeek, isBreak: false },
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
    });

    const existing: Placement[] = sameDay.map((slot) => ({
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

    const clash = findClash(existing, {
      id: replacing?.id,
      classSectionId,
      dayOfWeek,
      periodIndex,
      startTime: startTime || "08:00",
      endTime: endTime || "08:40",
      offeringId,
      staffIds,
      room,
    });

    if (clash) {
      const where = sameDay.find((slot) => slot.id === clash.with.id);
      const other = where
        ? `${where.classSection.classLevel.name} ${where.classSection.name}`
        : "another class";

      // Named rather than numbered. "Clashes with slot 47" is true and
      // useless; the person editing needs to know who or what is already
      // booked so they can decide what to move.
      if (clash.kind === "teacher") {
        const who = await db.staff.findUnique({
          where: { id: clash.subject ?? "" },
          select: { firstName: true, lastName: true },
        });
        return {
          error: `${who ? `${who.firstName} ${who.lastName}` : "That teacher"} is already teaching ${other} at ${clash.with.startTime}.`,
        };
      }

      if (clash.kind === "room") {
        return {
          error: `${clash.subject} is already in use by ${other} at ${clash.with.startTime}.`,
        };
      }

      return {
        error: `This class already has a lesson at ${clash.with.startTime}.`,
      };
    }
  }

  await db.timetableSlot.upsert({
    where: {
      classSectionId_dayOfWeek_periodIndex: { classSectionId, dayOfWeek, periodIndex },
    },
    create: {
      classSectionId,
      dayOfWeek,
      periodIndex,
      offeringId,
      startTime: startTime || "08:00",
      endTime: endTime || "08:40",
      room,
      label: text(formData, "label") || null,
      isBreak,
    },
    update: {
      offeringId,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      room,
      label: text(formData, "label") || null,
      isBreak,
    },
  });

  revalidatePath("/academics/timetable");
  revalidatePath("/my-timetable");
  return { ok: true, message: "Saved." };
}

// -----------------------------------------------------------------------------
// The academic calendar
// -----------------------------------------------------------------------------

export async function createCalendarEventAction(
  _previous: AcademicState,
  formData: FormData,
): Promise<AcademicState> {
  let user;
  try {
    user = await authorize("academic.year.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const title = text(formData, "title");
  const startsAt = text(formData, "startsAt");
  if (!title || !startsAt) return { error: "A title and a start date are both needed." };

  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return { error: "That start date is not valid." };

  // A single-day event needs no end date typed in; an end before the start is
  // always a slip of the keyboard rather than an intention.
  const endsAtRaw = text(formData, "endsAt");
  const end = endsAtRaw ? new Date(endsAtRaw) : start;
  if (Number.isNaN(end.getTime())) return { error: "That end date is not valid." };
  if (end < start) return { error: "The event cannot end before it starts." };

  const audiences = formData.getAll("audiences").map(String).filter(Boolean);

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });

  await db.calendarEvent.create({
    data: {
      academicYearId: year?.id ?? null,
      title,
      description: text(formData, "description") || null,
      category: text(formData, "category") || "GENERAL",
      startsAt: start,
      endsAt: end,
      allDay: true,
      location: text(formData, "location") || null,
      isHoliday: formData.get("isHoliday") === "on",
      audiences: (audiences.length
        ? audiences
        : ["STAFF", "STUDENT", "GUARDIAN"]) as never,
      createdById: user.id,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "academic.calendar.create",
      entity: "CalendarEvent",
      summary: `Added "${title}" to the calendar`,
    },
  });

  // Every portal shows the calendar, so every calendar view is refreshed.
  revalidatePath("/academics/calendar");
  revalidatePath("/portal/guardian/calendar");
  revalidatePath("/dashboard");
  return { ok: true, message: "Added to the calendar." };
}

export async function deleteCalendarEventAction(formData: FormData) {
  const user = await authorize("academic.year.manage");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const event = await db.calendarEvent.findUnique({
    where: { id },
    select: { title: true },
  });
  if (!event) return;

  await db.calendarEvent.delete({ where: { id } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "academic.calendar.delete",
      entity: "CalendarEvent",
      entityId: id,
      summary: `Removed "${event.title}" from the calendar`,
    },
  });

  revalidatePath("/academics/calendar");
  revalidatePath("/portal/guardian/calendar");
}
