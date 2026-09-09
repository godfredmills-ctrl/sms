/**
 * Tests for the staff sign-in book.
 *
 * Two of these are the reason the file exists.
 *
 * A teacher on approved leave must never read as absent, however the register
 * was marked and whenever the leave was approved. That is what stands between
 * a school and a deduction from somebody's wages for a day they were allowed
 * off, and it is not a hypothetical: leave is routinely approved after the
 * day it covers, because a teacher who wakes up ill submits the form when they
 * are well again.
 *
 * And leave dates arrive at LOCAL midnight while everything here is a calendar
 * day at UTC midnight. Read in the wrong frame, leave starting on Monday reads
 * as Sunday, which makes the Monday markable and the teacher absent. The test
 * for that builds its dates the wrong way on purpose.
 */

import {
  DEFAULT_EXPECTED_ARRIVAL,
  MARKABLE,
  absencesFromLeave,
  absentOn,
  completeness,
  countsAsPresent,
  countsTowardsRate,
  effectiveFor,
  formatClock,
  holidaysFromCalendar,
  latenessAgainst,
  markRefusal,
  missingRegisters,
  parseClock,
  schoolDay,
  statusLabel,
  statusTone,
  summarise,
  tally,
  type Effective,
  type Mark,
} from "../src/lib/staff-attendance-rules";

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
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** A local-midnight timestamp, the way StaffLeave actually stores one. */
const localMidnight = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// -----------------------------------------------------------------------------
// Clock times
// -----------------------------------------------------------------------------

check("a morning time", parseClock("07:45"), 465);
check("midnight", parseClock("00:00"), 0);
check("the last minute of the day", parseClock("23:59"), 1439);
check("a single-digit hour", parseClock("7:45"), 465);
check("25 hours is not a time", parseClock("25:00"), null);
check("60 minutes is not a time", parseClock("07:60"), null);
check("nor is a word", parseClock("morning"), null);
check("nor is nothing", parseClock(""), null);

check("back to a clock", formatClock(465), "07:45");
check("and midnight reads as midnight", formatClock(0), "00:00");
check("nothing formats as nothing", formatClock(null), "");
ok(
  "every minute of the day survives the round trip",
  Array.from({ length: 1440 }, (_, m) => m).every((m) => parseClock(formatClock(m)) === m),
);

check("twenty minutes late", latenessAgainst(465, 445), 20);
check(
  "on time is null, not zero, because zero is a lateness the database refuses",
  latenessAgainst(445, 445),
  null,
);
check("early is not negative lateness", latenessAgainst(400, 445), null);
check("no arrival, no lateness", latenessAgainst(null, 445), null);

// -----------------------------------------------------------------------------
// Leave wins
// -----------------------------------------------------------------------------

const present: Mark = {
  staffId: "s1",
  status: "PRESENT",
  arrivedMinutes: 465,
  leftMinutes: 900,
  minutesLate: null,
  reason: null,
};
const absent: Mark = { ...present, status: "ABSENT", arrivedMinutes: null, leftMinutes: null };

const noLeave = new Map<string, string>();
const onLeave = new Map([["s1", "SICK"]]);

check("a marked person reads as marked", effectiveFor("s1", present, noLeave).status, "PRESENT");
check("and the source is said", effectiveFor("s1", present, noLeave).source, "register");
check("an unmarked person is unmarked", effectiveFor("s1", null, noLeave).status, "UNMARKED");
check("not absent", effectiveFor("s1", null, noLeave).status === "ABSENT", false);

// The case the module exists for.
check(
  "somebody marked ABSENT who is on leave reads as ON_LEAVE",
  effectiveFor("s1", absent, onLeave).status,
  "ON_LEAVE",
);
check("and the leave type is carried", effectiveFor("s1", absent, onLeave).note, "SICK");
check("and the source says where it came from", effectiveFor("s1", absent, onLeave).source, "leave");
check(
  "leave beats a stored PRESENT too, so the answer does not depend on marking order",
  effectiveFor("s1", present, onLeave).status,
  "ON_LEAVE",
);
check(
  "and an unmarked person on leave is on leave, not unmarked",
  effectiveFor("s1", null, onLeave).status,
  "ON_LEAVE",
);
check(
  "leave for somebody else does not touch this person",
  effectiveFor("s2", absent, onLeave).status,
  "ABSENT",
);
check(
  "a person on leave carries no arrival time, whatever the row said",
  effectiveFor("s1", present, onLeave).arrivedMinutes,
  null,
);

// -----------------------------------------------------------------------------
// The frame. Leave is local midnight; a calendar day is UTC midnight.
// -----------------------------------------------------------------------------

const leaveRows = [
  {
    staffId: "s1",
    startDate: localMidnight("2026-09-07"),
    endDate: localMidnight("2026-09-09"),
    leaveType: "ANNUAL",
  },
];
const converted = absencesFromLeave(leaveRows);

check("the first day of leave is the first day of leave", converted[0].from.toISOString().slice(0, 10), "2026-09-07");
check("and the last is the last", converted[0].to.toISOString().slice(0, 10), "2026-09-09");

ok(
  "the first day of approved leave is not markable",
  absentOn(converted, on("2026-09-07")).has("s1"),
);
ok("nor the middle", absentOn(converted, on("2026-09-08")).has("s1"));
ok(
  "nor the last, because both ends are inclusive",
  absentOn(converted, on("2026-09-09")).has("s1"),
);
ok(
  "the day before leave starts IS markable",
  !absentOn(converted, on("2026-09-06")).has("s1"),
);
ok("and the day after", !absentOn(converted, on("2026-09-10")).has("s1"));

check(
  "a one-day leave covers that one day",
  absentOn(
    absencesFromLeave([
      {
        staffId: "s1",
        startDate: localMidnight("2026-09-07"),
        endDate: localMidnight("2026-09-07"),
        leaveType: "COMPASSIONATE",
      },
    ]),
    on("2026-09-07"),
  ).get("s1"),
  "COMPASSIONATE",
);

const holidays = holidaysFromCalendar([
  { startsAt: localMidnight("2026-09-21"), endsAt: localMidnight("2026-09-21"), title: "Founders Day" },
]);
check("a holiday keeps its day", holidays[0].from.toISOString().slice(0, 10), "2026-09-21");

// -----------------------------------------------------------------------------
// What a day is
// -----------------------------------------------------------------------------

const terms = [{ startDate: on("2026-09-08"), endDate: on("2026-12-18") }];

check("a term day is a school day", schoolDay(on("2026-09-15"), terms, []).expected, true);
check("and has nothing to say about itself", schoolDay(on("2026-09-15"), terms, []).reason, null);
check("the first day of term counts", schoolDay(on("2026-09-08"), terms, []).expected, true);
check("and the last", schoolDay(on("2026-12-18"), terms, []).expected, true);
check("the day before term does not", schoolDay(on("2026-09-07"), terms, []).expected, false);
check("and says why", schoolDay(on("2026-09-07"), terms, []).reason, "Outside term");
check("a holiday inside term is not a school day", schoolDay(on("2026-09-21"), terms, holidays).expected, false);
check("and it is named", schoolDay(on("2026-09-21"), terms, holidays).reason, "Founders Day");

// A Saturday in term. Reported, not refused: Ghanaian schools hold Saturday
// classes and a boarding school runs seven days.
check("a Saturday in term is still workable", schoolDay(on("2026-09-12"), terms, []).expected, true);
check("but is flagged as one", schoolDay(on("2026-09-12"), terms, []).reason, "Weekend");

// -----------------------------------------------------------------------------
// Refusals
// -----------------------------------------------------------------------------

const request = { status: "PRESENT" as const, arrivedMinutes: 465, leftMinutes: 900 };
const base = {
  date: on("2026-09-15"),
  now: on("2026-09-15"),
  onLeave: null,
  staffActive: true,
  request,
};

check("an ordinary mark is allowed", markRefusal(base), null);
check("today is not the future", markRefusal({ ...base, now: on("2026-09-15") }), null);
ok(
  "tomorrow is",
  String(markRefusal({ ...base, date: on("2026-09-16") })).includes("has not happened yet"),
);
ok(
  "yesterday is fine, because registers get written up late",
  markRefusal({ ...base, date: on("2026-09-14") }) === null,
);
ok(
  "somebody on leave cannot be marked over",
  String(markRefusal({ ...base, onLeave: "ANNUAL" })).includes("approved annual"),
);
ok(
  "and the refusal points at the leave, not at the register",
  String(markRefusal({ ...base, onLeave: "SICK" })).includes("Cancel or shorten"),
);
ok(
  "an inactive member of staff has no register",
  String(markRefusal({ ...base, staffActive: false })).includes("not active"),
);
ok(
  "absent with an arrival time is refused",
  String(
    markRefusal({ ...base, request: { status: "ABSENT", arrivedMinutes: 465, leftMinutes: null } }),
  ).includes("did not arrive"),
);
check(
  "absent with no times is fine",
  markRefusal({ ...base, request: { status: "ABSENT", arrivedMinutes: null, leftMinutes: null } }),
  null,
);
ok(
  "leaving before arriving is refused",
  String(
    markRefusal({ ...base, request: { status: "PRESENT", arrivedMinutes: 900, leftMinutes: 465 } }),
  ).includes("before they arrived"),
);
check(
  "arriving and leaving in the same minute is not a refusal",
  markRefusal({ ...base, request: { status: "PRESENT", arrivedMinutes: 465, leftMinutes: 465 } }),
  null,
);
ok(
  "a time outside the day is refused",
  markRefusal({ ...base, request: { status: "PRESENT", arrivedMinutes: 1440, leftMinutes: null } }) !== null,
);

// Ordering: leave is checked before the shape of the request, because the
// useful sentence is the one about leave.
ok(
  "leave is reported ahead of a malformed time",
  String(
    markRefusal({
      ...base,
      onLeave: "ANNUAL",
      request: { status: "PRESENT", arrivedMinutes: 9999, leftMinutes: null },
    }),
  ).includes("approved annual"),
);

// -----------------------------------------------------------------------------
// Counting
// -----------------------------------------------------------------------------

ok("present counts as present", countsAsPresent("PRESENT"));
ok("so does late, because they came in", countsAsPresent("LATE"));
ok("and half a day", countsAsPresent("HALF_DAY"));
ok("absent does not", !countsAsPresent("ABSENT"));
ok("on leave does not", !countsAsPresent("ON_LEAVE"));

ok("leave is left out of the rate entirely", !countsTowardsRate("ON_LEAVE"));
ok("and so is a day nobody marked", !countsTowardsRate("UNMARKED"));
ok("absence counts towards it", countsTowardsRate("ABSENT"));

const eff = (staffId: string, status: Effective["status"]): Effective => ({
  staffId,
  status,
  note: null,
  source: status === "ON_LEAVE" ? "leave" : status === "UNMARKED" ? "unmarked" : "register",
  arrivedMinutes: null,
  leftMinutes: null,
  minutesLate: null,
});

const day = [
  eff("a", "PRESENT"),
  eff("b", "PRESENT"),
  eff("c", "LATE"),
  eff("d", "ABSENT"),
  eff("e", "ON_LEAVE"),
  eff("f", "UNMARKED"),
];
const s = summarise(day);
check("everyone is counted once", s.total, 6);
check("present", s.present, 2);
check("late is its own line", s.late, 1);
check("absent", s.absent, 1);
check("on leave", s.onLeave, 1);
check("unmarked", s.unmarked, 1);
check(
  "the rate is three of four, because leave and unmarked are not in it",
  s.rate,
  75,
);

check(
  "a rate with nobody to count is null, not zero",
  summarise([eff("a", "ON_LEAVE")]).rate,
  null,
);
check("nothing at all is null too", summarise([]).rate, null);

const c = completeness(day);
check("five people need marking, not six", c.needed, 5);
check("four are done", c.done, 4);
ok("so it is not complete", !c.complete);
ok(
  "a register with everybody marked is complete",
  completeness([eff("a", "PRESENT"), eff("b", "ON_LEAVE")]).complete,
);
ok("an empty register is not complete", !completeness([]).complete);

const t = tally([
  { date: on("2026-09-14"), status: "PRESENT" },
  { date: on("2026-09-15"), status: "LATE" },
  { date: on("2026-09-16"), status: "ABSENT" },
  { date: on("2026-09-17"), status: "ON_LEAVE" },
]);
check("four days looked at", t.days, 4);
check("one present", t.present, 1);
check("one late", t.late, 1);
check("one absent", t.absent, 1);
check("one on leave", t.onLeave, 1);
check("two of three, leave excluded", t.rate, (2 / 3) * 100);

// -----------------------------------------------------------------------------
// Missing registers
// -----------------------------------------------------------------------------

const week = [{ startDate: on("2026-09-14"), endDate: on("2026-09-18") }];
check(
  "a week with nothing taken has five gaps",
  missingRegisters(on("2026-09-14"), on("2026-09-18"), [], week, []).length,
  5,
);
check(
  "taking two of them leaves three",
  missingRegisters(
    on("2026-09-14"),
    on("2026-09-18"),
    [on("2026-09-14"), on("2026-09-15")],
    week,
    [],
  ).length,
  3,
);
check(
  "a weekend is not a gap",
  missingRegisters(on("2026-09-19"), on("2026-09-20"), [], [{ startDate: on("2026-09-14"), endDate: on("2026-09-25") }], []).length,
  0,
);
check(
  "nor is a holiday",
  missingRegisters(
    on("2026-09-21"),
    on("2026-09-21"),
    [],
    [{ startDate: on("2026-09-14"), endDate: on("2026-09-25") }],
    holidaysFromCalendar([
      { startsAt: localMidnight("2026-09-21"), endsAt: localMidnight("2026-09-21"), title: "Founders Day" },
    ]),
  ).length,
  0,
);
check(
  "nor is a day outside term",
  missingRegisters(on("2026-08-10"), on("2026-08-14"), [], week, []).length,
  0,
);

// -----------------------------------------------------------------------------
// Labels
// -----------------------------------------------------------------------------

check("on leave reads as on leave", statusLabel("ON_LEAVE"), "On leave");
check("unmarked says so plainly", statusLabel("UNMARKED"), "Not marked");
check("and a stored one uses its own label", statusLabel("HALF_DAY"), "Half day");
check("leave is informational, not a fault", statusTone("ON_LEAVE"), "info");
check("absence is not", statusTone("ABSENT"), "danger");
ok(
  "every markable status has a label and a tone",
  MARKABLE.every((entry) => statusLabel(entry.value).length > 0 && statusTone(entry.value) !== "neutral"),
);
check("the school expects staff at 07:00 unless told otherwise", DEFAULT_EXPECTED_ARRIVAL, 420);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    x ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} staff attendance checks passed.`);
