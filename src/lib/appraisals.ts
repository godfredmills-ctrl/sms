import "server-only";

import { db } from "@/lib/db";
import type { Facts } from "@/lib/appraisal-rules";
import { weekOfTerm, weeksInTerm } from "@/lib/lesson-notes";

/**
 * Weeks of a term that have actually been taught by now.
 *
 * Nothing is owed for a week that has not happened. A term still running
 * counts the weeks up to this one; a term that has not started counts none.
 *
 * The same rule the lesson-note vetting queue applies, and deliberately the
 * same: two screens that disagree about how many notes a teacher owes is two
 * different answers to one question, and the one on the appraisal is the one
 * that ends up in a personnel file.
 */
function weeksTaught(term: { startDate: Date; endDate: Date }, now: Date): number {
  if (now < term.startDate) return 0;
  if (now > term.endDate) return weeksInTerm(term);
  return Math.max(0, Math.min(weeksInTerm(term), weekOfTerm(now, term) - 1));
}

/**
 * The facts the rest of the system already holds about a member of staff.
 *
 * Six queries that nobody has ever run together. Lesson notes, registers,
 * cover, leave, and the teaching load that gives all of them their meaning.
 *
 * Every one is scoped to a period, because a figure without a period is not a
 * fact: "34 lesson notes" is meaningless and "34 of 36 in the second term" is
 * something an appraiser can talk about.
 *
 * Nothing here is combined, weighted or scored. See the note at the head of
 * appraisal-rules.ts, which is the whole design of this module and the reason
 * it stops where it does.
 */
export async function factsFor(
  staffId: string,
  period: { from: Date; to: Date; academicYearId: string },
): Promise<Facts> {
  const [offerings, terms, notes, sessions, cover, leave, slots] = await Promise.all([
    db.subjectOffering.findMany({
      where: {
        academicYearId: period.academicYearId,
        isActive: true,
        OR: [{ teacherId: staffId }, { coTeacherIds: { has: staffId } }],
      },
      // termId, because an offering exists once per term and the expectation
      // below is per term. Without it the arithmetic is out by a factor of
      // however many terms the year has.
      select: { id: true, termId: true },
    }),

    // The terms the period actually covers: all of them for a year-long
    // appraisal, one for a termly one.
    db.term.findMany({
      where: {
        academicYearId: period.academicYearId,
        startDate: { lte: period.to },
        endDate: { gte: period.from },
      },
      select: { id: true, startDate: true, endDate: true },
    }),

    // Handed in means handed in: a draft is a form somebody opened, which is
    // the same rule the vetting queue applies.
    db.lessonNote.findMany({
      where: {
        offering: {
          academicYearId: period.academicYearId,
          OR: [{ teacherId: staffId }, { coTeacherIds: { has: staffId } }],
        },
        weekEnding: { gte: period.from, lte: period.to },
      },
      select: { status: true, weekEnding: true, submittedAt: true },
    }),

    db.attendanceSession.count({
      where: { takenById: staffId, date: { gte: period.from, lte: period.to } },
    }),

    db.coverAssignment.count({
      where: { coverStaffId: staffId, date: { gte: period.from, lte: period.to } },
    }),

    db.staffLeave.findMany({
      where: {
        staffId,
        status: "APPROVED",
        startDate: { lte: period.to },
        endDate: { gte: period.from },
      },
      select: { days: true, leaveType: true },
    }),

    db.timetableSlot.count({
      where: {
        isBreak: false,
        offering: {
          academicYearId: period.academicYearId,
          OR: [{ teacherId: staffId }, { coTeacherIds: { has: staffId } }],
        },
      },
    }),
  ]);

  const teaches = offerings.length > 0;

  /*
   * What was expected of them, rather than what they happened to write.
   *
   * A teacher who handed in nothing has no rows, so counting rows alone would
   * report them as perfect. The school asks for one note per subject per week
   * of term, so that is what is counted.
   *
   * Per term, and it has to be. The first version multiplied every offering by
   * the weeks in the whole period, and an offering exists once per term: eight
   * subjects across three terms became twenty-four, times fifty-two weeks, and
   * the screen read "14 of 432 handed in" beside a man's name. A denominator
   * that is a guess is worse than no denominator, which is the same reason
   * registers below have none.
   */
  const now = new Date();

  const expectedNotes = terms.reduce((sum, term) => {
    const inTerm = offerings.filter((offering) => offering.termId === term.id).length;
    return sum + inTerm * weeksTaught(term, now);
  }, 0);

  const handedIn = notes.filter((note) => note.status !== "DRAFT");
  const late = handedIn.filter(
    (note) =>
      note.submittedAt !== null &&
      // A note is for the week it heads, so handing it in after the Friday it
      // ends is handing it in after the week was taught.
      note.submittedAt.getTime() > note.weekEnding.getTime(),
  );

  return {
    lessonNotes: teaches
      ? { handedIn: handedIn.length, expected: expectedNotes, late: late.length }
      : null,

    // A count, and no denominator. How many registers a teacher owes depends
    // on which classes hold one, whether a day has an afternoon session, and
    // what the school does on a games afternoon, none of which is modelled.
    registers: sessions > 0 || teaches ? { taken: sessions } : null,

    coverTaken: teaches ? cover : null,

    leave: leave.length
      ? {
          days: leave.reduce((sum, row) => sum + row.days, 0),
          sick: leave
            .filter((row) => row.leaveType === "SICK")
            .reduce((sum, row) => sum + row.days, 0),
        }
      : null,

    teachingLoad: teaches ? slots : null,
  };
}
