/**
 * Billing by the month, alongside billing by the term.
 *
 * The system has always raised one invoice per pupil per term, because that is
 * how most schools here charge. Some charge monthly, and a few charge both: a
 * monthly tuition fee, and an examination levy once a term. So the cycle
 * belongs to the fee structure rather than to the school, and a school can
 * publish one of each and run them side by side.
 *
 * ---------------------------------------------------------------------------
 * Dates here are calendar months, not instants.
 * ---------------------------------------------------------------------------
 *
 * A billing month is the first of that month at UTC midnight, which is what
 * Invoice.billingMonth is: a Postgres DATE. The same rule the cover board
 * learned the hard way, and for the same reason. Built as local midnight, the
 * first of September in British Summer Time is 23:00 on the thirty-first of
 * August, and a DATE column keeps the August. A month billed under the wrong
 * name is a bill a parent disputes and a bursar cannot explain.
 *
 * ---------------------------------------------------------------------------
 * A month belongs to exactly one term.
 * ---------------------------------------------------------------------------
 *
 * April can be the tail of one term and the head of the next. Left alone, a
 * generator that walks the terms would raise two April invoices for one child,
 * and both would look correct. The month goes to whichever term holds more of
 * it, ties to the earlier one, and the database refuses a second invoice for a
 * pupil and a month whatever this file believes.
 */

export type Cycle = "TERM" | "MONTHLY";

export const CYCLES = [
  {
    value: "TERM",
    label: "Once a term",
    hint: "One bill per pupil per term, which is how most schools here charge.",
  },
  {
    value: "MONTHLY",
    label: "Every month",
    hint: "One bill per pupil per month of the term, each with its own due date.",
  },
] as const;

export function cycleLabel(value: string): string {
  return CYCLES.find((cycle) => cycle.value === value)?.label ?? value;
}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export type Month = {
  /** The first of the month, UTC midnight. What the DATE column holds. */
  start: Date;
  /** "2026-09". Sorts, and is what a select posts. */
  key: string;
  /** "September 2026". What a parent reads on the bill. */
  label: string;
};

/** The first of the month a date falls in, as a calendar day. */
export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** The last day of the month a date falls in. */
export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(date: Date): string {
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function asMonth(date: Date): Month {
  const start = startOfMonth(date);
  return { start, key: monthKey(start), label: monthLabel(start) };
}

/** "2026-09" back to a month, or null if it is not one. */
export function parseMonth(value: string | null | undefined): Month | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  return asMonth(new Date(Date.UTC(year, month - 1, 1)));
}

/** Every calendar month a period touches, in order. */
export function monthsBetween(from: Date, to: Date): Month[] {
  if (to < from) return [];

  const months: Month[] = [];
  let cursor = startOfMonth(from);
  const last = startOfMonth(to);

  // A guard rather than a while(true): a term with a corrupt end date a
  // century out should not hang the invoice screen.
  for (let step = 0; step < 240 && cursor <= last; step += 1) {
    months.push(asMonth(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return months;
}

// ---------------------------------------------------------------------------
// Which term a month belongs to
// ---------------------------------------------------------------------------

/**
 * A term, as the database holds one.
 *
 * startDate and endDate are read as calendar days in UTC, because that is what
 * the application writes: the year form parses a date-only string with
 * new Date("2026-09-08"), which is UTC midnight.
 *
 * Worth saying out loud because it is the OPPOSITE of the leave dates the
 * cover board reads, which are written as local midnight and have to be
 * converted with dayOf. Two date-only fields in one system, written two
 * different ways, and each is only correct when read the way it was written.
 * A term date written as local midnight in a timezone ahead of Greenwich would
 * be read here as the day before, which is a bill named after the wrong month
 * once a year, in September or in January.
 */
export type TermSpan = { id: string; name: string; startDate: Date; endDate: Date };

/** Days of a month that fall inside a term. Both ends inclusive. */
export function overlapDays(month: Month, term: TermSpan): number {
  const from = Math.max(month.start.getTime(), startOfDay(term.startDate).getTime());
  const to = Math.min(endOfMonth(month.start).getTime(), startOfDay(term.endDate).getTime());
  if (to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * The term a month is billed under.
 *
 * Whichever holds more of the month. April is often the tail of one term and
 * the head of the next, and without a rule the generator raises two April
 * invoices for one child, each correct on its own terms.
 *
 * A tie goes to the earlier term, which is arbitrary and is the point: it has
 * to be the SAME arbitrary answer every time the question is asked, or two
 * screens disagree about which term a bill belongs to.
 */
export function termForMonth(month: Month, terms: TermSpan[]): TermSpan | null {
  let best: TermSpan | null = null;
  let bestDays = 0;

  for (const term of [...terms].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  )) {
    const days = overlapDays(month, term);
    if (days > bestDays) {
      best = term;
      bestDays = days;
    }
  }

  return bestDays > 0 ? best : null;
}

/**
 * The months a school can bill, across a year's terms.
 *
 * Deduplicated: a month that straddles two terms appears once, under the term
 * that holds more of it. Holidays are not billable months, because no term
 * covers them, which is the answer a school billing monthly actually wants —
 * nobody charges tuition for August.
 */
export function billableMonths(terms: TermSpan[]): Array<Month & { term: TermSpan }> {
  const seen = new Map<string, Month & { term: TermSpan }>();

  for (const term of terms) {
    for (const month of monthsBetween(term.startDate, term.endDate)) {
      if (seen.has(month.key)) continue;
      const owner = termForMonth(month, terms);
      if (owner) seen.set(month.key, { ...month, term: owner });
    }
  }

  return [...seen.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ---------------------------------------------------------------------------
// When it falls due
// ---------------------------------------------------------------------------

/**
 * The due date for a month's bill, on a day the school chooses.
 *
 * Clamped to the end of the month, so a school that bills on the thirty-first
 * gets the twenty-eighth in February rather than the third of March. A due
 * date that quietly lands in the next month is how a bill is overdue before
 * the reminder rules have looked at it.
 */
export function dueDateFor(month: Month, dayOfMonth: number): Date {
  const last = endOfMonth(month.start).getUTCDate();
  const day = Math.min(Math.max(1, Math.round(dayOfMonth)), last);
  return new Date(
    Date.UTC(month.start.getUTCFullYear(), month.start.getUTCMonth(), day),
  );
}

/** Whether a month has begun, so it can honestly be billed. */
export function hasStarted(month: Month, now: Date): boolean {
  return startOfDay(now).getTime() >= month.start.getTime();
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * Why this run cannot go ahead, or null.
 *
 * Billing a month that has not started is the one worth refusing outright. It
 * is easy to do from a select of the whole year, it produces bills a school
 * then has to withdraw, and a family that has been invoiced for a month their
 * child may not be at the school for is a conversation nobody wants.
 */
export function generationRefusal(input: {
  cycle: Cycle;
  month: Month | null;
  months: Array<Month & { term: TermSpan }>;
  now: Date;
  structures: number;
}): string | null {
  if (input.structures === 0) {
    return input.cycle === "MONTHLY"
      ? "No published fee structure is set to bill monthly. Set the cycle on a structure first, under Fee structures."
      : "No published fee structure matches this year and term.";
  }

  if (input.cycle !== "MONTHLY") return null;

  if (!input.month) return "Choose the month to bill.";

  if (!input.months.some((candidate) => candidate.key === input.month?.key)) {
    return `${input.month.label} is not in any term of this year, so there is nothing to bill for it.`;
  }

  if (!hasStarted(input.month, input.now)) {
    return `${input.month.label} has not started. Billing a month in advance produces invoices the school then has to withdraw.`;
  }

  return null;
}
