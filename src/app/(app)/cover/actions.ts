"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  absentOn,
  addDays,
  dayKey,
  dayOf,
  isoDayOfWeek,
  parseDay,
  periodsToCover,
  rankCandidates,
  refusal,
  type Arrangement,
  type CoverKind,
  type Lesson,
} from "@/lib/cover-rules";
import { notifyUsers } from "@/lib/messaging";
import { humanise } from "@/lib/utils";

export type CoverState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * The day as the whole module sees it: who is away, what they were teaching,
 * and what has already been decided.
 *
 * One function because the page and the action must be looking at the same
 * day. The page offers a name on the strength of a timetable it read; if the
 * action reads a different one, the name it accepts is not the name that was
 * offered, and the disagreement shows up as a teacher standing in a corridor.
 */
async function dayContext(date: Date) {
  const dayOfWeek = isoDayOfWeek(date);

  const [slots, leaves] = await Promise.all([
    db.timetableSlot.findMany({
      where: { dayOfWeek, isBreak: false, offeringId: { not: null } },
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
    // Approved leave only. A pending request is a request, and arranging cover
    // against one tells a teacher their leave was granted by a screen that had
    // no business granting it.
    //
    // A day either side of what is wanted, because these are timestamps
    // written as local midnight and the date being asked about is a calendar
    // day. Within an hour of each other in Accra and a day apart in Vancouver,
    // which is why the window is coarse here and absentOn decides exactly.
    db.staffLeave.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: addDays(date, 1) },
        endDate: { gte: addDays(date, -1) },
      },
      select: { staffId: true, startDate: true, endDate: true, leaveType: true },
    }),
  ]);

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

  const absent = absentOn(
    leaves.map((row) => ({
      staffId: row.staffId,
      from: dayOf(row.startDate),
      to: dayOf(row.endDate),
      reason: `${humanise(row.leaveType)} leave`,
    })),
    date,
  );

  const rows = await db.coverAssignment.findMany({
    where: { date },
    select: { slotId: true, kind: true, coverStaffId: true },
  });

  const arrangements: Arrangement[] = rows.map((row) => ({
    slotId: row.slotId,
    kind: row.kind as CoverKind,
    coverStaffId: row.coverStaffId,
  }));

  return { dayOfWeek, lessons, absent, arrangements };
}

/**
 * Arrange cover for one period on one day.
 *
 * Everything that could refuse it lives in cover-rules and is called by the
 * screen as well, so a name the form offered is a name this accepts. The two
 * checks that cannot be done there are the ones about the world outside the
 * day: that the period exists, and that its teacher is in fact away.
 */
export async function arrangeCoverAction(
  _previous: CoverState,
  formData: FormData,
): Promise<CoverState> {
  const user = await authorize("academic.cover.manage");

  const date = parseDay(text(formData, "date"));
  if (!date) return { error: "Choose a date." };

  const slotId = text(formData, "slotId");
  if (!slotId) return { error: "Choose a period." };

  const kind = text(formData, "kind");
  const coverStaffId = text(formData, "coverStaffId") || null;
  const note = text(formData, "note");

  const { lessons, absent, arrangements } = await dayContext(date);

  const lesson = lessons.find((row) => row.slotId === slotId);
  if (!lesson) return { error: "That period is not on the timetable for that day." };

  if (!lesson.staffId) {
    return {
      error:
        "Nobody is assigned to teach that period, so there is nobody to cover for. Assign the subject first.",
    };
  }

  // The whole reason the row is allowed to exist. Leave shortened or cancelled
  // between the page loading and the button being pressed lands here, which is
  // exactly when it should: better a refusal than a cover slip for a teacher
  // who is at their desk.
  if (!absent.has(lesson.staffId)) {
    return {
      error:
        "That teacher is not recorded as away on that day. Their leave may have been cancelled or shortened since this page was opened.",
    };
  }

  const refused = refusal(
    lesson,
    kind,
    coverStaffId,
    note,
    lessons,
    arrangements,
    absent,
  );
  if (refused) return { error: refused };

  await db.coverAssignment.upsert({
    where: { slotId_date: { slotId, date } },
    create: {
      date,
      dayOfWeek: lesson.dayOfWeek,
      slotId,
      absentStaffId: lesson.staffId,
      kind: kind as CoverKind,
      coverStaffId,
      note: note || null,
      arrangedById: user.staffId ?? null,
    },
    update: {
      kind: kind as CoverKind,
      coverStaffId,
      note: note || null,
      arrangedById: user.staffId ?? null,
    },
  });

  // Being given cover is news, and a noticeboard nobody walks past is not.
  // Told once, at the point the decision is made, which is also the point at
  // which the person could still say they cannot.
  if (coverStaffId) {
    const covering = await db.staff.findUnique({
      where: { id: coverStaffId },
      select: { userId: true },
    });

    if (covering?.userId) {
      await notifyUsers([covering.userId], {
        title: "You have been given cover",
        category: "ACADEMIC",
        body: `${lesson.subject}, ${lesson.className} at ${lesson.startTime} on ${dayKey(date)}.`,
        url: "/my-timetable",
      }).catch(() => undefined);
    }
  }

  revalidatePath("/cover");
  revalidatePath("/my-timetable");

  return { ok: true, message: "Cover arranged." };
}

/**
 * Undo one arrangement.
 *
 * The period goes back to being uncovered rather than to being covered by
 * nobody, which are different things on the board and only one of them is a
 * decision somebody made.
 */
export async function clearCoverAction(
  _previous: CoverState,
  formData: FormData,
): Promise<CoverState> {
  await authorize("academic.cover.manage");

  const date = parseDay(text(formData, "date"));
  const slotId = text(formData, "slotId");
  if (!date || !slotId) return { error: "Choose a period." };

  await db.coverAssignment.deleteMany({ where: { slotId, date } });

  revalidatePath("/cover");
  revalidatePath("/my-timetable");

  return { ok: true, message: "Cleared. The period is uncovered again." };
}

/**
 * Fill every remaining hole with the best free candidate.
 *
 * Offered because a deputy head with fourteen periods to place at ten to seven
 * in the morning will otherwise do it by asking whoever is standing nearby,
 * and whoever is standing nearby is the same three people every time.
 *
 * It places one at a time and re-reads what it has placed, so the second
 * period does not hand the same teacher the same minute. Periods with nobody
 * free are left alone rather than forced: an empty room is a fact, and the
 * board should show it rather than a name that cannot be there.
 */
export async function autoArrangeAction(
  _previous: CoverState,
  formData: FormData,
): Promise<CoverState> {
  const user = await authorize("academic.cover.manage");

  const date = parseDay(text(formData, "date"));
  if (!date) return { error: "Choose a date." };

  const { lessons, absent, arrangements } = await dayContext(date);

  const teachers = await db.staff.findMany({
    where: { status: "ACTIVE", isTeaching: true },
    select: {
      id: true,
      title: true,
      firstName: true,
      lastName: true,
      department: true,
      specialisations: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const candidatePool = teachers.map((staff) => ({
    staffId: staff.id,
    name: [staff.title, staff.firstName, staff.lastName].filter(Boolean).join(" "),
    department: staff.department,
    specialisations: staff.specialisations,
    isTeaching: true,
  }));

  const decided = new Set(arrangements.map((row) => row.slotId));
  const holes = periodsToCover(lessons, absent, date).filter(
    (lesson) => !decided.has(lesson.slotId),
  );

  if (holes.length === 0) {
    return { ok: true, message: "Every period was already dealt with." };
  }

  const running = [...arrangements];
  let placed = 0;

  for (const lesson of holes) {
    const best = rankCandidates(lesson, candidatePool, lessons, running, absent)[0];
    if (!best || !lesson.staffId) continue;

    await db.coverAssignment.create({
      data: {
        date,
        dayOfWeek: lesson.dayOfWeek,
        slotId: lesson.slotId,
        absentStaffId: lesson.staffId,
        kind: "TEACHER",
        coverStaffId: best.staffId,
        arrangedById: user.staffId ?? null,
      },
    });

    running.push({ slotId: lesson.slotId, kind: "TEACHER", coverStaffId: best.staffId });
    placed += 1;
  }

  revalidatePath("/cover");
  revalidatePath("/my-timetable");

  const left = holes.length - placed;

  return {
    ok: true,
    message:
      left === 0
        ? `${placed} ${placed === 1 ? "period" : "periods"} arranged. Check the names before the bell.`
        : `${placed} arranged. ${left} left with nobody free in the whole school.`,
  };
}
