/**
 * The staff sign-in book.
 *
 * A school already knows three things about whether a teacher was at work on
 * Tuesday, and before this file they were three separate opinions:
 *
 *   Leave says Mr Mensah was approved for Monday to Wednesday.
 *   The register says he was marked ABSENT on Tuesday.
 *   Payroll deducts a day.
 *
 * None of those is wrong on its own terms and none of them errors. The teacher
 * finds out at the end of the month, on a payslip, and the school finds out
 * when he is standing in the bursar's office with it.
 *
 * ---------------------------------------------------------------------------
 * Leave wins, and is never stored
 * ---------------------------------------------------------------------------
 *
 * ON_LEAVE is a status this module returns and the database has no column for.
 * The register stores only what a person decided in the hall that morning; the
 * leave table is asked at the moment the register is read.
 *
 * That ordering is the whole point, and it is the one the cover board already
 * uses. Leave gets approved late, and it gets approved retrospectively: a
 * teacher off sick on Tuesday submits the form on Thursday and it is approved
 * on Friday. If the register had copied "ABSENT" into a report, Friday's
 * approval would change nothing and the deduction would stand. Deriving it
 * means Friday's approval silently corrects Tuesday, which is what everyone
 * involved already believes has happened.
 *
 * It runs the other way too. Cancelled leave stops excusing the day, without
 * anybody remembering to go back and re-mark a register from three weeks ago.
 *
 * ---------------------------------------------------------------------------
 * Time is minutes past midnight
 * ---------------------------------------------------------------------------
 *
 * 07:45 is 465. Not a timestamp, because a sign-in book records a clock time
 * on a named day, and an instant carries a timezone whether or not anybody
 * wanted one. This is the same lesson the cover board learned when local
 * midnight on British Summer Time turned Thursday into Wednesday, except that
 * here the column cannot drift at all: the migration CHECKs 0 to 1439.
 *
 * Pure and client-safe, like the cover and timetable rules it sits beside. The
 * screen that offers a status and the action that writes one must agree about
 * who may be marked, or the screen is a suggestion box.
 */

import { dayKey, dayOf, isWeekend, sameDay, startOfDay, type Absence } from "@/lib/cover-rules";

export { absentOn, absentThatDay, dayKey, dayOf, isWeekend, parseDay, startOfDay, today } from "@/lib/cover-rules";
export type { Absence } from "@/lib/cover-rules";

// ---------------------------------------------------------------------------
// Clock times
// ---------------------------------------------------------------------------

/** Minutes past midnight, as the column holds them. */
export const MINUTES_IN_A_DAY = 1440;

/** "07:45" to 465, or null if it is not a time. */
export function parseClock(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/** 465 to "07:45". */
export function formatClock(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "";
  const clamped = Math.min(Math.max(0, Math.round(minutes)), MINUTES_IN_A_DAY - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/**
 * How late an arrival is against the time the school expects.
 *
 * Null rather than zero when they were on time, because zero minutes late is a
 * number the database refuses and a report would otherwise count as a late
 * arrival. On time is not a small amount of lateness.
 */
export function latenessAgainst(
  arrivedMinutes: number | null,
  expectedMinutes: number,
): number | null {
  if (arrivedMinutes === null) return null;
  const late = arrivedMinutes - expectedMinutes;
  return late > 0 ? late : null;
}

/** When the school expects staff on site, if nobody has said otherwise. */
export const DEFAULT_EXPECTED_ARRIVAL = 7 * 60; // 07:00

/** Minutes of grace before a late arrival is called late. */
export const DEFAULT_GRACE_MINUTES = 15;

// ---------------------------------------------------------------------------
// What a day is
// ---------------------------------------------------------------------------

export type SchoolDay = {
  /** Whether staff were expected in at all. */
  expected: boolean;
  /** Why not, when they were not. Shown to whoever opened the register. */
  reason: string | null;
};

export type TermSpan = { startDate: Date; endDate: Date };
export type Holiday = { from: Date; to: Date; title: string };

/**
 * Whether this is a day the school works.
 *
 * A register taken on a holiday marks the whole staff absent, and absence is
 * an input to payroll and to appraisal. The cost of getting this wrong is not
 * a wrong number on a screen; it is a deduction from somebody's wages for a
 * day the school was closed.
 *
 * Weekends are reported but not refused. Ghanaian schools hold Saturday
 * remedial classes and a boarding school runs seven days, so a Saturday
 * register is a real thing somebody may want to take. It is flagged, and the
 * person taking it decides.
 */
export function schoolDay(
  date: Date,
  terms: TermSpan[],
  holidays: Holiday[],
): SchoolDay {
  const day = startOfDay(date).getTime();

  const holiday = holidays.find(
    (entry) =>
      startOfDay(entry.from).getTime() <= day && day <= startOfDay(entry.to).getTime(),
  );
  if (holiday) return { expected: false, reason: holiday.title };

  const inTerm = terms.some(
    (term) =>
      startOfDay(term.startDate).getTime() <= day &&
      day <= startOfDay(term.endDate).getTime(),
  );
  if (!inTerm) return { expected: false, reason: "Outside term" };

  if (isWeekend(date)) return { expected: true, reason: "Weekend" };

  return { expected: true, reason: null };
}

// ---------------------------------------------------------------------------
// The effective status of one person on one day
// ---------------------------------------------------------------------------

/** The statuses the register can store. Mirrors the AttendanceStatus enum. */
export const MARKABLE = [
  { value: "PRESENT", label: "Present", tone: "success" as const },
  { value: "LATE", label: "Late", tone: "warning" as const },
  { value: "ABSENT", label: "Absent", tone: "danger" as const },
  { value: "SICK", label: "Sick", tone: "warning" as const },
  { value: "EXCUSED", label: "Excused", tone: "info" as const },
  { value: "HALF_DAY", label: "Half day", tone: "info" as const },
] as const;

export type Markable = (typeof MARKABLE)[number]["value"];

/** Everything the register can report, including the one it cannot store. */
export type EffectiveStatus = Markable | "ON_LEAVE" | "UNMARKED";

export type Mark = {
  staffId: string;
  status: Markable;
  arrivedMinutes: number | null;
  leftMinutes: number | null;
  minutesLate: number | null;
  reason: string | null;
};

export type Effective = {
  staffId: string;
  status: EffectiveStatus;
  /** Leave type, an absence reason, or null. */
  note: string | null;
  /** Where the answer came from, so a screen can say so. */
  source: "leave" | "register" | "unmarked";
  arrivedMinutes: number | null;
  leftMinutes: number | null;
  minutesLate: number | null;
};

/**
 * What the register actually says about somebody, once leave is taken into
 * account.
 *
 * Leave beats a stored row every time, including a stored PRESENT. That looks
 * strange written down and is right: somebody approved for leave who came in
 * anyway has a leave record to cancel, and until it is cancelled the school's
 * own paperwork says they were off. Two systems disagreeing is the thing being
 * cured here, and curing it means one of them has to lose consistently rather
 * than whichever was written last.
 */
export function effectiveFor(
  staffId: string,
  mark: Mark | null | undefined,
  onLeave: Map<string, string>,
): Effective {
  const leave = onLeave.get(staffId);
  if (leave) {
    return {
      staffId,
      status: "ON_LEAVE",
      note: leave,
      source: "leave",
      arrivedMinutes: null,
      leftMinutes: null,
      minutesLate: null,
    };
  }

  if (!mark) {
    return {
      staffId,
      status: "UNMARKED",
      note: null,
      source: "unmarked",
      arrivedMinutes: null,
      leftMinutes: null,
      minutesLate: null,
    };
  }

  return {
    staffId,
    status: mark.status,
    note: mark.reason,
    source: "register",
    arrivedMinutes: mark.arrivedMinutes,
    leftMinutes: mark.leftMinutes,
    minutesLate: mark.minutesLate,
  };
}

export function statusLabel(status: EffectiveStatus): string {
  if (status === "ON_LEAVE") return "On leave";
  if (status === "UNMARKED") return "Not marked";
  return MARKABLE.find((entry) => entry.value === status)?.label ?? status;
}

export function statusTone(
  status: EffectiveStatus,
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "ON_LEAVE") return "info";
  if (status === "UNMARKED") return "neutral";
  return MARKABLE.find((entry) => entry.value === status)?.tone ?? "neutral";
}

/** Whether a status means the person was at work, for an attendance rate. */
export function countsAsPresent(status: EffectiveStatus): boolean {
  return status === "PRESENT" || status === "LATE" || status === "HALF_DAY";
}

/**
 * Whether a day counts towards an attendance rate at all.
 *
 * Leave and unmarked days are excluded rather than counted as absence. A
 * teacher on approved maternity leave has not got a bad attendance record, and
 * a day nobody took the register is a fact about the school rather than about
 * the teacher. Counting either would make the number an accusation.
 */
export function countsTowardsRate(status: EffectiveStatus): boolean {
  return status !== "ON_LEAVE" && status !== "UNMARKED";
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export type MarkRequest = {
  status: Markable;
  arrivedMinutes: number | null;
  leftMinutes: number | null;
};

/**
 * Why this mark cannot be recorded, or null.
 *
 * Every one of these is also a database constraint. That is deliberate rather
 * than redundant: the constraint is what makes the bad row impossible, and this
 * is what tells somebody why, in a sentence, before they have lost what they
 * typed. A constraint violation surfacing as "P2010" to a head teacher taking
 * a register is a support call.
 */
export function markRefusal(input: {
  date: Date;
  now: Date;
  onLeave: string | null;
  staffActive: boolean;
  request: MarkRequest;
}): string | null {
  if (!input.staffActive) {
    return "This member of staff is not active, so there is no register to mark them on.";
  }

  if (startOfDay(input.date).getTime() > startOfDay(input.now).getTime()) {
    return "That day has not happened yet. A register marked in advance records absences for people who then turn up.";
  }

  if (input.onLeave) {
    return `They are on approved ${input.onLeave.toLowerCase()} that day. Cancel or shorten the leave if they were in, rather than marking over it.`;
  }

  const { status, arrivedMinutes, leftMinutes } = input.request;

  if (status === "ABSENT" && (arrivedMinutes !== null || leftMinutes !== null)) {
    return "Somebody absent did not arrive. Clear the times, or mark them present.";
  }

  if (arrivedMinutes !== null && (arrivedMinutes < 0 || arrivedMinutes >= MINUTES_IN_A_DAY)) {
    return "That is not a time of day.";
  }

  if (leftMinutes !== null && (leftMinutes < 0 || leftMinutes >= MINUTES_IN_A_DAY)) {
    return "That is not a time of day.";
  }

  if (arrivedMinutes !== null && leftMinutes !== null && leftMinutes < arrivedMinutes) {
    return "They cannot have left before they arrived.";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export type Summary = {
  /** Active staff the register covers. */
  total: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  unmarked: number;
  /** Present as a share of those who could have been present. Null when none. */
  rate: number | null;
};

export function summarise(entries: Effective[]): Summary {
  const summary: Summary = {
    total: entries.length,
    present: 0,
    late: 0,
    absent: 0,
    onLeave: 0,
    unmarked: 0,
    rate: null,
  };

  let counted = 0;
  let here = 0;

  for (const entry of entries) {
    if (entry.status === "ON_LEAVE") summary.onLeave += 1;
    else if (entry.status === "UNMARKED") summary.unmarked += 1;
    else if (entry.status === "LATE") summary.late += 1;
    else if (entry.status === "PRESENT" || entry.status === "HALF_DAY") summary.present += 1;
    else summary.absent += 1;

    if (countsTowardsRate(entry.status)) {
      counted += 1;
      if (countsAsPresent(entry.status)) here += 1;
    }
  }

  summary.rate = counted > 0 ? (here / counted) * 100 : null;
  return summary;
}

/**
 * How complete the register is for a day.
 *
 * Separate from the attendance rate on purpose. "92% present" computed from
 * four people out of forty is not a fact about the school, and a screen that
 * shows one number cannot tell the reader which it is looking at.
 */
export function completeness(entries: Effective[]): {
  needed: number;
  done: number;
  complete: boolean;
} {
  const needed = entries.filter((entry) => entry.status !== "ON_LEAVE").length;
  const done = entries.filter(
    (entry) => entry.status !== "ON_LEAVE" && entry.status !== "UNMARKED",
  ).length;
  return { needed, done, complete: needed > 0 && done === needed };
}

/** A person's record over a span of days, for their staff page. */
export function tally(
  entries: Array<{ date: Date; status: EffectiveStatus }>,
): { days: number; present: number; absent: number; late: number; onLeave: number; rate: number | null } {
  let present = 0;
  let absent = 0;
  let late = 0;
  let onLeave = 0;
  let counted = 0;

  for (const entry of entries) {
    if (entry.status === "ON_LEAVE") onLeave += 1;
    else if (entry.status === "LATE") late += 1;
    else if (countsAsPresent(entry.status)) present += 1;
    else if (entry.status !== "UNMARKED") absent += 1;

    if (countsTowardsRate(entry.status)) counted += 1;
  }

  return {
    days: entries.length,
    present,
    absent,
    late,
    onLeave,
    rate: counted > 0 ? ((present + late) / counted) * 100 : null,
  };
}

/**
 * Days in a span the school worked and nobody marked a register.
 *
 * The gap worth reporting. A missing register is invisible on every other
 * screen: the rate is computed from the days that exist, so a term with four
 * registers taken reads as excellent attendance.
 */
export function missingRegisters(
  from: Date,
  to: Date,
  taken: Date[],
  terms: TermSpan[],
  holidays: Holiday[],
): Date[] {
  const have = new Set(taken.map((date) => dayKey(date)));
  const gaps: Date[] = [];

  let cursor = startOfDay(from);
  const last = startOfDay(to);

  for (let step = 0; step < 400 && cursor.getTime() <= last.getTime(); step += 1) {
    const day = schoolDay(cursor, terms, holidays);
    if (day.expected && !isWeekend(cursor) && !have.has(dayKey(cursor))) {
      gaps.push(cursor);
    }
    cursor = new Date(cursor.getTime() + 86_400_000);
  }

  return gaps;
}

/** True when two calendar days are the same day. Re-exported for screens. */
export function isSameDay(a: Date, b: Date): boolean {
  return sameDay(a, b);
}

/**
 * Absences shaped for absentOn, from leave rows as the database holds them.
 *
 * dayOf is not optional here, and this is the single easiest thing in the file
 * to get wrong. StaffLeave.startDate and endDate are plain timestamps written
 * at LOCAL midnight; everything in this module is a calendar day at UTC
 * midnight. Passed through unconverted, leave starting on Monday the 7th in a
 * timezone ahead of Greenwich reads as Sunday the 6th, and a teacher on
 * approved leave is markable, and marked, absent on the Monday.
 *
 * The cover board does the same conversion at the same boundary, for the same
 * reason. Two date-only fields in one system written two different ways, and
 * each is only correct when read the way it was written.
 */
export function absencesFromLeave(
  rows: Array<{ staffId: string; startDate: Date; endDate: Date; leaveType: string }>,
): Absence[] {
  return rows.map((row) => ({
    staffId: row.staffId,
    from: dayOf(row.startDate),
    to: dayOf(row.endDate),
    reason: row.leaveType,
  }));
}

/**
 * Holidays shaped for schoolDay, from calendar rows as the database holds them.
 *
 * Same conversion, same reason: CalendarEvent.startsAt and endsAt are
 * timestamps, and a holiday that reads a day early closes the school on a day
 * it was open.
 */
export function holidaysFromCalendar(
  rows: Array<{ startsAt: Date; endsAt: Date; title: string }>,
): Holiday[] {
  return rows.map((row) => ({
    from: dayOf(row.startsAt),
    to: dayOf(row.endsAt),
    title: row.title,
  }));
}
