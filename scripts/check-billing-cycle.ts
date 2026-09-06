/**
 * Tests for monthly billing.
 *
 * Three things go wrong here, and a school finds out about all three from a
 * parent rather than from an error.
 *
 * The month a bill is named after. Built as local midnight, the first of
 * September on British Summer Time is 23:00 on the thirty-first of August, and
 * a DATE column keeps the August. The bill then says August and covers
 * September, which is a dispute a bursar cannot win.
 *
 * The month that straddles two terms. April is often the tail of one and the
 * head of the next, and a generator walking the terms raises two April
 * invoices for one child, each correct on its own terms.
 *
 * The due date that lands in the next month. Bill on the thirty-first and
 * February hands you the third of March, by which time the invoice is overdue
 * before the reminder rules have looked at it.
 */

import {
  CYCLES,
  asMonth,
  billableMonths,
  cycleLabel,
  dueDateFor,
  endOfMonth,
  generationRefusal,
  hasStarted,
  monthKey,
  monthLabel,
  monthsBetween,
  overlapDays,
  parseMonth,
  startOfMonth,
  termForMonth,
  type TermSpan,
} from "../src/lib/billing-cycle";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) passed += 1;
  else failures.push(`${name}\n      expected ${b}\n      actual   ${a}`);
}

function ok(name: string, condition: boolean) {
  check(name, condition, true);
}

/** A calendar day, the way every date in the module is held. */
const on = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

/** A local-midnight date, the way a careless caller would build one. */
const localMidnight = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

// -----------------------------------------------------------------------------
// The cycle
// -----------------------------------------------------------------------------

check("two cycles", CYCLES.length, 2);
check("each has a hint", CYCLES.every((cycle) => cycle.hint), true);
check("termly is the familiar one", cycleLabel("TERM"), "Once a term");
check("and monthly the new one", cycleLabel("MONTHLY"), "Every month");
check("an unknown cycle is shown as itself", cycleLabel("WEEKLY"), "WEEKLY");

// -----------------------------------------------------------------------------
// Months
// -----------------------------------------------------------------------------

check("the first of the month", startOfMonth(on("2026-09-18")).toISOString(), "2026-09-01T00:00:00.000Z");
check("from the first itself", startOfMonth(on("2026-09-01")).toISOString(), "2026-09-01T00:00:00.000Z");
check("the last of the month", endOfMonth(on("2026-09-05")).getUTCDate(), 30);
check("of a long one", endOfMonth(on("2026-01-05")).getUTCDate(), 31);
check("of February", endOfMonth(on("2026-02-05")).getUTCDate(), 28);
check("of a leap February", endOfMonth(on("2028-02-05")).getUTCDate(), 29);

check("the key", monthKey(on("2026-09-01")), "2026-09");
check("padded", monthKey(on("2026-01-01")), "2026-01");
check("the label", monthLabel(on("2026-09-01")), "September 2026");
check("December", monthLabel(on("2026-12-01")), "December 2026");

/*
 * The one that decides what a bill is called.
 *
 * A month built from local parts on British Summer Time is 23:00 on the last
 * day of the month before, and a Postgres DATE keeps that day. The bill then
 * says August and covers September.
 */
check("the first of September is September", monthKey(asMonth(on("2026-09-01")).start), "2026-09");

/*
 * The trap this module is read in UTC to avoid, stated as a test so that a
 * change to how term dates are written fails here rather than in a parent
 * telephone call.
 *
 * The application writes term dates with new Date("2026-09-08"), which is UTC
 * midnight, and reading them in UTC is therefore right. Written as LOCAL
 * midnight in a timezone ahead of Greenwich, the same day is 23:00 on the day
 * before, and every date-only reading of it is out by one. That is the
 * opposite convention from the leave dates the cover board reads, which is why
 * neither module can be written to guess.
 */
const localFirst = localMidnight("2026-09-01");
const aheadOfUtc = localFirst.getTime() < Date.UTC(2026, 8, 1);
check(
  "a locally built first of the month is only safe from Greenwich or west of it",
  asMonth(localFirst).key,
  aheadOfUtc ? "2026-08" : "2026-09",
);
ok(
  "which is why term dates are written UTC and read UTC",
  monthKey(asMonth(new Date(Date.UTC(2026, 8, 8))).start) === "2026-09",
);
check(
  "and a date late in the month is too",
  asMonth(on("2026-09-30")).label,
  "September 2026",
);
check(
  "a month read in UTC does not slip backwards",
  asMonth(new Date(Date.UTC(2026, 8, 1, 0, 0, 0))).key,
  "2026-09",
);

check("a month parses", parseMonth("2026-09")?.label, "September 2026");
check("padded", parseMonth("2026-01")?.key, "2026-01");
check("with space around it", parseMonth("  2026-09 ")?.key, "2026-09");
check("month zero is not a month", parseMonth("2026-00"), null);
check("month thirteen is not", parseMonth("2026-13"), null);
check("a day is not a month", parseMonth("2026-09-01"), null);
check("nothing is not", parseMonth(""), null);
check("null is not", parseMonth(null), null);

check(
  "the months a term touches",
  monthsBetween(on("2026-09-08"), on("2026-12-18")).map((month) => month.key),
  ["2026-09", "2026-10", "2026-11", "2026-12"],
);
check(
  "a term inside one month",
  monthsBetween(on("2026-09-08"), on("2026-09-24")).map((month) => month.key),
  ["2026-09"],
);
check(
  "crossing a year",
  monthsBetween(on("2026-11-20"), on("2027-02-03")).map((month) => month.key),
  ["2026-11", "2026-12", "2027-01", "2027-02"],
);
check("backwards is nothing, not a hang", monthsBetween(on("2026-12-01"), on("2026-09-01")), []);
check("the same day is one month", monthsBetween(on("2026-09-08"), on("2026-09-08")).length, 1);

// A corrupt end date must not spin the invoice screen for ever.
ok("a century of months is capped", monthsBetween(on("2026-01-01"), on("2200-01-01")).length <= 240);

// -----------------------------------------------------------------------------
// Which term owns a month
// -----------------------------------------------------------------------------

const term = (id: string, name: string, from: string, to: string): TermSpan => ({
  id,
  name,
  startDate: on(from),
  endDate: on(to),
});

const terms = [
  term("t1", "Term 1", "2026-09-08", "2026-12-18"),
  term("t2", "Term 2", "2027-01-08", "2027-04-02"),
  term("t3", "Term 3", "2027-04-22", "2027-07-24"),
];

check("a month wholly inside a term", overlapDays(asMonth(on("2026-10-01")), terms[0]!), 31);
check("the month a term starts in", overlapDays(asMonth(on("2026-09-01")), terms[0]!), 23);
check("the month it ends in", overlapDays(asMonth(on("2026-12-01")), terms[0]!), 18);
check("a month outside it entirely", overlapDays(asMonth(on("2026-08-01")), terms[0]!), 0);
check("a month after it", overlapDays(asMonth(on("2027-02-01")), terms[0]!), 0);

check("October is Term 1", termForMonth(asMonth(on("2026-10-01")), terms)?.id, "t1");
check("January is Term 2", termForMonth(asMonth(on("2027-01-01")), terms)?.id, "t2");
check("August is nobody's", termForMonth(asMonth(on("2026-08-01")), terms), null);

/*
 * April, which sits in both. Term 2 holds the 1st and 2nd; Term 3 holds the
 * 22nd to the 30th. Term 3 holds more of it, so April is billed under Term 3,
 * and only once.
 */
check("April holds two days of Term 2", overlapDays(asMonth(on("2027-04-01")), terms[1]!), 2);
check("and nine of Term 3", overlapDays(asMonth(on("2027-04-01")), terms[2]!), 9);
check("so April is Term 3", termForMonth(asMonth(on("2027-04-01")), terms)?.id, "t3");

// A tie has to be the same arbitrary answer every time, or two screens
// disagree about which term a bill belongs to.
const tied = [
  term("a", "A", "2027-05-01", "2027-05-10"),
  term("b", "B", "2027-05-22", "2027-05-31"),
];
check("a tie goes to the earlier term", termForMonth(asMonth(on("2027-05-01")), tied)?.id, "a");
check("and does so whichever order they arrive in", termForMonth(asMonth(on("2027-05-01")), [...tied].reverse())?.id, "a");

// -----------------------------------------------------------------------------
// The billable months of a year
// -----------------------------------------------------------------------------

const months = billableMonths(terms);

check(
  "every month of every term, once each",
  months.map((month) => month.key),
  [
    "2026-09",
    "2026-10",
    "2026-11",
    "2026-12",
    "2027-01",
    "2027-02",
    "2027-03",
    "2027-04",
    "2027-05",
    "2027-06",
    "2027-07",
  ],
);

// The one this function exists for. April appears once, not twice, and under
// the term that holds more of it.
check("April appears once", months.filter((month) => month.key === "2027-04").length, 1);
check("and under Term 3", months.find((month) => month.key === "2027-04")?.term.id, "t3");

// Nobody charges tuition for August, and August is in no term.
ok("August is not billable", !months.some((month) => month.key === "2026-08"));
check("eleven billable months in a year", months.length, 11);
check("in order", months[0]?.key, "2026-09");
check("no terms, no months", billableMonths([]).length, 0);

// -----------------------------------------------------------------------------
// Due dates
// -----------------------------------------------------------------------------

check("the tenth", dueDateFor(asMonth(on("2026-09-01")), 10).toISOString(), "2026-09-10T00:00:00.000Z");
check("the first", dueDateFor(asMonth(on("2026-09-01")), 1).getUTCDate(), 1);

// Bill on the thirty-first and February hands back the third of March, by
// which time the bill is overdue before anything has looked at it.
check("the thirty-first of September is the thirtieth", dueDateFor(asMonth(on("2026-09-01")), 31).getUTCDate(), 30);
check("of February, the twenty-eighth", dueDateFor(asMonth(on("2026-02-01")), 31).getUTCDate(), 28);
check("of a leap February, the twenty-ninth", dueDateFor(asMonth(on("2028-02-01")), 31).getUTCDate(), 29);
check("and it stays in its own month", dueDateFor(asMonth(on("2026-02-01")), 31).getUTCMonth(), 1);

check("a day of nought is the first", dueDateFor(asMonth(on("2026-09-01")), 0).getUTCDate(), 1);
check("a negative day is the first", dueDateFor(asMonth(on("2026-09-01")), -5).getUTCDate(), 1);
check("a fractional day rounds", dueDateFor(asMonth(on("2026-09-01")), 10.6).getUTCDate(), 11);

ok("a month that has begun", hasStarted(asMonth(on("2026-09-01")), on("2026-09-01")));
ok("and one well under way", hasStarted(asMonth(on("2026-09-01")), on("2026-09-20")));
ok("and a past one", hasStarted(asMonth(on("2026-09-01")), on("2027-01-04")));
ok("but not one still to come", !hasStarted(asMonth(on("2026-10-01")), on("2026-09-30")));

// -----------------------------------------------------------------------------
// Refusals
// -----------------------------------------------------------------------------

const refuse = (over: Partial<Parameters<typeof generationRefusal>[0]> = {}) =>
  generationRefusal({
    cycle: "MONTHLY",
    month: asMonth(on("2026-10-01")),
    months,
    now: on("2026-10-05"),
    structures: 1,
    ...over,
  });

check("an ordinary monthly run", refuse(), null);
check("a termly run", refuse({ cycle: "TERM", month: null }), null);

check(
  "no monthly structure says which kind is missing",
  refuse({ structures: 0 }),
  "No published fee structure is set to bill monthly. Set the cycle on a structure first, under Fee structures.",
);
check(
  "and a termly run says the other thing",
  refuse({ cycle: "TERM", structures: 0, month: null }),
  "No published fee structure matches this year and term.",
);

check("no month chosen", refuse({ month: null }), "Choose the month to bill.");

check(
  "a month in no term",
  refuse({ month: asMonth(on("2026-08-01")) }),
  "August 2026 is not in any term of this year, so there is nothing to bill for it.",
);

// The refusal worth having. It is one click from a select of the whole year,
// and it produces bills the school then has to withdraw from families whose
// children may not be there.
check(
  "a month that has not started",
  refuse({ month: asMonth(on("2026-12-01")), now: on("2026-10-05") }),
  "December 2026 has not started. Billing a month in advance produces invoices the school then has to withdraw.",
);
check(
  "the first day of the month is not in advance",
  refuse({ month: asMonth(on("2026-12-01")), now: on("2026-12-01") }),
  null,
);
check(
  "and a month already gone is fine to bill late",
  refuse({ month: asMonth(on("2026-09-01")), now: on("2026-10-05") }),
  null,
);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    x ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} billing cycle checks passed.`);
