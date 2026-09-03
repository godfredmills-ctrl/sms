/**
 * Cover: who stands in front of a class when the teacher is not there.
 *
 * The module exists because two parts of this system already knew half the
 * answer and never spoke. Leave approves Mr Mensah for Monday to Wednesday.
 * The timetable goes on saying Mr Mensah teaches JHS 2 Amber mathematics at
 * 09:30 on Tuesday. Neither is wrong, neither errors, and the class sits by
 * itself until somebody walking past notices.
 *
 * Absence is DERIVED here, never stored. The only thing a cover row records is
 * the decision: who is taking the lesson. Ask the leave table who is out and
 * the answer changes when leave is cancelled or shortened; copy it into a
 * cover table and it does not, and a fortnight later the board is confidently
 * arranging cover for a man who came back to work.
 *
 * Pure and client-safe on purpose, like the timetable rules it borrows from.
 * The screen that offers a name and the action that writes it down must agree
 * about who is free, or the screen is a suggestion box.
 */

import { minutesOf, overlaps, type Span } from "@/lib/timetable-rules";

// ---------------------------------------------------------------------------
// Dates
//
// Everything here is a calendar day, not an instant, and a calendar day is
// held as UTC midnight. That is not a preference; it is what the column is.
// CoverAssignment.date is a Postgres DATE, the migration CHECKs that its ISO
// weekday equals the slot's, and Postgres reads the weekday off the value it
// was given.
//
// The first run of the seed died on exactly that CHECK. The dates were built
// as LOCAL midnight, the machine was on British Summer Time, and local
// midnight on Thursday the third is 23:00 UTC on Wednesday the second. The
// constraint refused a Wednesday row claiming to be a Thursday, which is
// precisely what it is for: without it the board would have quietly been a day
// out, in one timezone, for whoever happened to be running it.
//
// So: two frames, named, and never mixed.
//
//   A calendar day is UTC midnight. parseDay, startOfDay, addDays, dayKey and
//   isoDayOfWeek all read and write in UTC.
//
//   A timestamp column written as local midnight — which is what StaffLeave
//   holds, and what every date-only field in this system held before this file
//   existed — is converted with dayOf, once, at the point it is read.
// ---------------------------------------------------------------------------

/** "2026-09-03" as a calendar day, or null if it is not a date. */
export function parseDay(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 February, which rolls forward silently rather than failing.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  return date;
}

/** The calendar day a value already in the calendar frame belongs to. */
export function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * The calendar day a local timestamp falls in.
 *
 * The one conversion between the two frames, and the only place a local
 * getter is allowed in this file. Use it on values that were written as local
 * midnight — StaffLeave.startDate, StaffLeave.endDate — and on the clock, for
 * which the answer wanted is the date on the wall of the school office rather
 * than the date in Greenwich.
 *
 * Never use it on CoverAssignment.date: that column is already a calendar day,
 * and reading it in a timezone behind UTC would move it back a day.
 */
export function dayOf(stamp: Date): Date {
  return new Date(Date.UTC(stamp.getFullYear(), stamp.getMonth(), stamp.getDate()));
}

/** Today, as the school office would say it. */
export function today(): Date {
  return dayOf(new Date());
}

/** "2026-09-03". */
export function dayKey(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/** 1 = Monday through 7 = Sunday, matching TimetableSlot.dayOfWeek. */
export function isoDayOfWeek(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

export function isWeekend(date: Date): boolean {
  return isoDayOfWeek(date) >= 6;
}

/** Same calendar day, ignoring the time of day on either side. */
export function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function addDays(date: Date, days: number): Date {
  const next = startOfDay(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

// ---------------------------------------------------------------------------
// Who is out
// ---------------------------------------------------------------------------

export type Absence = {
  staffId: string;
  /** First day away, as a calendar day: see dayOf. */
  from: Date;
  /** Last day away, inclusive: a one-day absence has from === to. */
  to: Date;
  /** "Annual leave", "Sick leave". Shown on the board; staff read it. */
  reason: string;
};

/**
 * Whether an absence covers a day.
 *
 * Both ends are inclusive. Leave from Monday to Monday is one day off, not
 * none, and the version of this that used an exclusive end sent a teacher home
 * and left their Monday lessons showing as taught by them.
 */
export function absentThatDay(absence: Absence, date: Date): boolean {
  const day = startOfDay(date).getTime();
  return (
    startOfDay(absence.from).getTime() <= day && day <= startOfDay(absence.to).getTime()
  );
}

/** Everybody out on a given day, and why. */
export function absentOn(absences: Absence[], date: Date): Map<string, string> {
  const out = new Map<string, string>();

  for (const absence of absences) {
    if (!absentThatDay(absence, date)) continue;
    // First reason wins. Somebody with two overlapping rows is a leave-table
    // problem; the board still has to name one thing.
    if (!out.has(absence.staffId)) out.set(absence.staffId, absence.reason);
  }

  return out;
}

// ---------------------------------------------------------------------------
// What needs covering
// ---------------------------------------------------------------------------

export type Lesson = {
  slotId: string;
  dayOfWeek: number;
  periodIndex: number;
  startTime: string;
  endTime: string;
  /** Null when nobody is assigned to the subject at all. */
  staffId: string | null;
  subjectId: string | null;
  subject: string;
  className: string;
  room: string | null;
};

export const COVER_KINDS = [
  {
    value: "TEACHER",
    label: "Another teacher takes it",
    hint: "The lesson happens. Best when somebody free teaches the subject.",
  },
  {
    value: "SUPERVISED",
    label: "Supervised, set work",
    hint: "Somebody sits with the class. Honest about what it is: minding, not teaching.",
  },
  {
    value: "MERGED",
    label: "Merged with another class",
    hint: "The class joins another. Name the teacher who ends up with both.",
  },
  {
    value: "CANCELLED",
    label: "Nobody, the period is lost",
    hint: "Recorded rather than hidden, with a reason. A term of these is a staffing problem.",
  },
] as const;

export type CoverKind = (typeof COVER_KINDS)[number]["value"];

export function kindLabel(value: string): string {
  return COVER_KINDS.find((kind) => kind.value === value)?.label ?? value;
}

export function kindTone(value: string): "success" | "warning" | "danger" | "neutral" {
  if (value === "TEACHER") return "success";
  if (value === "SUPERVISED" || value === "MERGED") return "warning";
  if (value === "CANCELLED") return "danger";
  return "neutral";
}

/** A cover kind that leaves nobody in the room. */
export function isLost(kind: string): boolean {
  return kind === "CANCELLED";
}

export type Arrangement = {
  slotId: string;
  kind: CoverKind;
  /** Null only when the period is lost. */
  coverStaffId: string | null;
};

/**
 * The periods on this day whose teacher is away.
 *
 * Sorted by the clock and then by class, because that is the order the day
 * happens in and the order a deputy head works down the list.
 */
export function periodsToCover(
  lessons: Lesson[],
  absent: Map<string, string>,
  date: Date,
): Lesson[] {
  const dayOfWeek = isoDayOfWeek(date);

  return lessons
    .filter(
      (lesson) =>
        lesson.dayOfWeek === dayOfWeek &&
        lesson.staffId !== null &&
        absent.has(lesson.staffId),
    )
    .sort(
      (a, b) =>
        (minutesOf(a.startTime) ?? 0) - (minutesOf(b.startTime) ?? 0) ||
        a.className.localeCompare(b.className),
    );
}

// ---------------------------------------------------------------------------
// Who is free
// ---------------------------------------------------------------------------

/**
 * Everybody who cannot be given a lesson at this time, and why.
 *
 * Three ways to be unavailable and they are not the same sentence, which is
 * why this returns reasons rather than a set: a teacher who is out is out, a
 * teacher who is teaching cannot be in two rooms, and a teacher who was given
 * cover ten minutes ago has already been asked.
 */
export function busyAt(
  span: Span,
  dayOfWeek: number,
  lessons: Lesson[],
  arrangements: Arrangement[],
  absent: Map<string, string>,
): Map<string, string> {
  const busy = new Map<string, string>();

  for (const [staffId, reason] of absent) busy.set(staffId, reason);

  const bySlot = new Map(lessons.map((lesson) => [lesson.slotId, lesson]));

  for (const lesson of lessons) {
    if (!lesson.staffId || lesson.dayOfWeek !== dayOfWeek) continue;
    if (!overlaps(lesson, span)) continue;
    if (busy.has(lesson.staffId)) continue;
    busy.set(lesson.staffId, `Teaching ${lesson.subject}, ${lesson.className}`);
  }

  for (const arrangement of arrangements) {
    if (!arrangement.coverStaffId) continue;

    const lesson = bySlot.get(arrangement.slotId);
    if (!lesson || lesson.dayOfWeek !== dayOfWeek) continue;
    if (!overlaps(lesson, span)) continue;
    if (busy.has(arrangement.coverStaffId)) continue;

    busy.set(arrangement.coverStaffId, `Already covering ${lesson.className}`);
  }

  return busy;
}

export type Teacher = {
  staffId: string;
  name: string;
  department: string | null;
  specialisations: string[];
  isTeaching: boolean;
};

export type Candidate = {
  staffId: string;
  name: string;
  /** Why this name is near the top: "Teaches Mathematics", "Science". */
  because: string;
  /** Periods already timetabled for them on this day. */
  teachingToday: number;
  /** Periods of cover already given to them on this day. */
  coveringToday: number;
  /** A reason to think twice. Not a refusal: the deputy decides. */
  caution: string | null;
};

/** Periods this person is timetabled to teach on a day. */
export function teachingLoad(
  lessons: Lesson[],
  staffId: string,
  dayOfWeek: number,
): number {
  return lessons.filter(
    (lesson) => lesson.staffId === staffId && lesson.dayOfWeek === dayOfWeek,
  ).length;
}

/** Periods of cover this person has already been given. */
export function coverTally(arrangements: Arrangement[]): Map<string, number> {
  const tally = new Map<string, number>();

  for (const arrangement of arrangements) {
    if (!arrangement.coverStaffId) continue;
    tally.set(arrangement.coverStaffId, (tally.get(arrangement.coverStaffId) ?? 0) + 1);
  }

  return tally;
}

/**
 * Who could take this lesson, best first.
 *
 * The order says something about what the school thinks cover is for:
 *
 *   1. Somebody who teaches the subject, so the lesson happens rather than the
 *      class being minded for forty minutes.
 *   2. Failing that, somebody in the same department, who can at least read
 *      the note the absent teacher left.
 *   3. Then whoever has been asked least today, and then whoever has the
 *      lightest day. Cover falls on the person with room for it, not the
 *      person whose surname starts with A, which is what happens when a list
 *      is offered alphabetically and somebody is in a hurry.
 *
 * A free period is not free time. It is when marking, preparation and seeing a
 * parent happen, and a school that fills every one of them with cover has
 * found a way to make its best teachers leave. Hence the caution: the list
 * still offers a third cover of the day, and still says out loud that it is
 * the third.
 */
export function rankCandidates(
  lesson: Lesson,
  teachers: Teacher[],
  lessons: Lesson[],
  arrangements: Arrangement[],
  absent: Map<string, string>,
): Candidate[] {
  /*
   * Cover already given to this very period does not make its holder busy.
   *
   * Without this the person currently covering is the one name missing from
   * the list of who could cover it, on the grounds that they are covering it.
   * The screen showed exactly that: an arranged period whose dropdown could
   * not display the teacher whose name was printed above it.
   *
   * refusal() does the same filtering, and deliberately: the list of names the
   * screen offers and the list the action accepts have to be the same list.
   */
  const others = arrangements.filter(
    (arrangement) => arrangement.slotId !== lesson.slotId,
  );

  const busy = busyAt(lesson, lesson.dayOfWeek, lessons, others, absent);
  const covering = coverTally(others);

  // Anyone with an offering in this subject teaches it, whatever the staff
  // record claims. specialisations is typed in by hand at hiring and goes
  // stale; the timetable is what the person actually does this term.
  const teachesSubject = new Set(
    lessons
      .filter((other) => other.subjectId && other.subjectId === lesson.subjectId)
      .map((other) => other.staffId)
      .filter((staffId): staffId is string => Boolean(staffId)),
  );

  const departments = new Set(
    lessons
      .filter((other) => other.subjectId && other.subjectId === lesson.subjectId)
      .map(
        (other) =>
          teachers.find((teacher) => teacher.staffId === other.staffId)?.department ?? null,
      )
      .filter((department): department is string => Boolean(department)),
  );

  const ranked = teachers
    .filter(
      (teacher) =>
        teacher.isTeaching &&
        teacher.staffId !== lesson.staffId &&
        !busy.has(teacher.staffId),
    )
    .map((teacher) => {
      const subject =
        teachesSubject.has(teacher.staffId) ||
        teacher.specialisations.some(
          (name) => name.toLowerCase() === lesson.subject.toLowerCase(),
        );
      const department = Boolean(teacher.department) && departments.has(teacher.department!);

      const teachingToday = teachingLoad(lessons, teacher.staffId, lesson.dayOfWeek);
      const coveringToday = covering.get(teacher.staffId) ?? 0;

      return {
        staffId: teacher.staffId,
        name: teacher.name,
        because: subject
          ? `Teaches ${lesson.subject}`
          : department
            ? `${teacher.department} department`
            : "Free this period",
        teachingToday,
        coveringToday,
        caution:
          coveringToday >= 2
            ? `Already covering ${coveringToday} periods today`
            : teachingToday >= 6
              ? `Teaching ${teachingToday} periods today`
              : null,
        rank: subject ? 0 : department ? 1 : 2,
      };
    });

  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.coveringToday - b.coveringToday ||
        a.teachingToday - b.teachingToday ||
        a.name.localeCompare(b.name),
    )
    .map(({ staffId, name, because, teachingToday, coveringToday, caution }) => ({
      staffId,
      name,
      because,
      teachingToday,
      coveringToday,
      caution,
    }));
}

/**
 * Why this arrangement cannot be written down, or null if it can.
 *
 * The action calls this and so does the form. Same sentences either way: a
 * refusal a screen has never heard of is a refusal that arrives as a crash.
 */
export function refusal(
  lesson: Lesson,
  kind: string,
  coverStaffId: string | null,
  note: string,
  lessons: Lesson[],
  arrangements: Arrangement[],
  absent: Map<string, string>,
): string | null {
  if (!COVER_KINDS.some((entry) => entry.value === kind)) {
    return "Choose what happens to the period.";
  }

  if (isLost(kind)) {
    if (coverStaffId) {
      return "A lost period has nobody covering it. Choose somebody, or say the period is lost.";
    }
    if (!note.trim()) {
      return "Say why the period is being lost. A blank one is the row nobody can answer for at the end of term.";
    }
    return null;
  }

  if (!coverStaffId) return "Choose who is taking the lesson.";

  if (coverStaffId === lesson.staffId) {
    return "That is the teacher who is away. Somebody else has to take it.";
  }

  // The row being replaced must not block its own replacement: editing an
  // arrangement to change the note would otherwise refuse on the grounds that
  // the person is already covering it. rankCandidates drops the same row for
  // the same reason.
  const reason = busyAt(
    lesson,
    lesson.dayOfWeek,
    lessons,
    arrangements.filter((arrangement) => arrangement.slotId !== lesson.slotId),
    absent,
  ).get(coverStaffId);

  if (reason) return `${reason.replace(/^Teaching/, "They are teaching")} at that time.`;

  return null;
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

export type Slip = {
  staffId: string;
  periods: Array<{ lesson: Lesson; kind: CoverKind }>;
};

/**
 * The same day grouped the way it gets read.
 *
 * The deputy works down a list of holes. Everybody else looks for their own
 * name, which is why the noticeboard version is per person: a teacher wants
 * "you have JHS 2 Amber at 09:30", not the whole grid with themselves in it
 * somewhere.
 */
export function slips(arrangements: Arrangement[], lessons: Lesson[]): Slip[] {
  const bySlot = new Map(lessons.map((lesson) => [lesson.slotId, lesson]));
  const byStaff = new Map<string, Slip>();

  for (const arrangement of arrangements) {
    if (!arrangement.coverStaffId) continue;

    const lesson = bySlot.get(arrangement.slotId);
    if (!lesson) continue;

    const slip = byStaff.get(arrangement.coverStaffId) ?? {
      staffId: arrangement.coverStaffId,
      periods: [],
    };
    slip.periods.push({ lesson, kind: arrangement.kind });
    byStaff.set(arrangement.coverStaffId, slip);
  }

  for (const slip of byStaff.values()) {
    slip.periods.sort(
      (a, b) =>
        (minutesOf(a.lesson.startTime) ?? 0) - (minutesOf(b.lesson.startTime) ?? 0),
    );
  }

  return [...byStaff.values()].sort((a, b) => b.periods.length - a.periods.length);
}

export type Summary = {
  /** Teachers out today who were due to teach something. */
  out: number;
  /** Periods their absence leaves. */
  affected: number;
  /** Periods with somebody in the room. */
  arranged: number;
  /** Periods nobody has dealt with yet. This is the number that matters. */
  uncovered: number;
  /** Periods written off. Not the same as uncovered: somebody decided. */
  lost: number;
};

export function summarise(
  toCover: Lesson[],
  arrangements: Arrangement[],
  absent: Map<string, string>,
): Summary {
  const decided = new Map(
    arrangements.map((arrangement) => [arrangement.slotId, arrangement.kind]),
  );

  let arranged = 0;
  let lost = 0;
  let uncovered = 0;

  for (const lesson of toCover) {
    const kind = decided.get(lesson.slotId);
    if (!kind) uncovered += 1;
    else if (isLost(kind)) lost += 1;
    else arranged += 1;
  }

  const teaching = new Set(
    toCover.map((lesson) => lesson.staffId).filter((id): id is string => Boolean(id)),
  );

  return {
    out: [...absent.keys()].filter((staffId) => teaching.has(staffId)).length,
    affected: toCover.length,
    arranged,
    uncovered,
    lost,
  };
}
