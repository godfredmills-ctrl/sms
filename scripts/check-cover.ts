/**
 * Tests for cover arithmetic.
 *
 * Three things go wrong here and none of them raise anything.
 *
 * Dates. A day is a calendar day, not an instant, and the difference between
 * those two is one row of the board being for yesterday. Half these checks are
 * about inclusive ends and local midnight.
 *
 * Who is free. The screen offers a name and the action writes it down, and if
 * the two disagree the school sends a teacher to a room they are already
 * teaching in. Both call busyAt, so busyAt is worth pinning.
 *
 * The order of the list. It is not correctness in the compiler's sense, but a
 * ranking that quietly stops preferring the subject teacher turns cover from
 * teaching into minding, and nobody notices for a term.
 */

import {
  COVER_KINDS,
  absentOn,
  absentThatDay,
  addDays,
  busyAt,
  coverTally,
  dayKey,
  isLost,
  isWeekend,
  dayOf,
  isoDayOfWeek,
  kindLabel,
  kindTone,
  parseDay,
  periodsToCover,
  rankCandidates,
  refusal,
  sameDay,
  slips,
  startOfDay,
  summarise,
  teachingLoad,
  today,
  type Absence,
  type Arrangement,
  type Lesson,
  type Teacher,
} from "../src/lib/cover-rules";

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

/** A local timestamp, the way StaffLeave writes one. */
const stamp = (iso: string, hour = 0) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, hour);
};

// -----------------------------------------------------------------------------
// Dates
// -----------------------------------------------------------------------------

check("a date parses", dayKey(parseDay("2026-09-03")!), "2026-09-03");
check("a padded date parses", dayKey(parseDay("2026-01-05")!), "2026-01-05");
check("surrounding space is trimmed", dayKey(parseDay("  2026-09-03 ")!), "2026-09-03");

check("an empty string is not a date", parseDay(""), null);
check("null is not a date", parseDay(null), null);
check("a slashed date is not this format", parseDay("2026/09/03"), null);
check("a short year is not a date", parseDay("26-09-03"), null);
check("month thirteen is not a date", parseDay("2026-13-01"), null);
check("month zero is not a date", parseDay("2026-00-10"), null);
check("day zero is not a date", parseDay("2026-09-00"), null);

// The one that matters: the Date constructor rolls this forward to 3 March
// without complaining, and a board built for it is silently a board for
// another day.
check("31 February is not a date", parseDay("2026-02-31"), null);
check("31 September is not a date", parseDay("2026-09-31"), null);
check("29 February in a leap year is", dayKey(parseDay("2028-02-29")!), "2028-02-29");
check("29 February otherwise is not", parseDay("2026-02-29"), null);

// A date-only string through the Date constructor is UTC midnight, which is
// the day before in any timezone west of Greenwich. parseDay builds local
// midnight from the parts, so the weekday it reports is the weekday printed on
// the calendar wherever the server happens to be.
check("parsing keeps the weekday", isoDayOfWeek(parseDay("2026-09-03")!), 4);
check("Monday is 1", isoDayOfWeek(on("2026-08-31")), 1);
check("Friday is 5", isoDayOfWeek(on("2026-09-04")), 5);
check("Saturday is 6", isoDayOfWeek(on("2026-09-05")), 6);
check("Sunday is 7, not 0", isoDayOfWeek(on("2026-09-06")), 7);

ok("Saturday is a weekend", isWeekend(on("2026-09-05")));
ok("Sunday is a weekend", isWeekend(on("2026-09-06")));
ok("Monday is not", !isWeekend(on("2026-08-31")));
ok("Friday is not", !isWeekend(on("2026-09-04")));

const afternoon = new Date(Date.UTC(2026, 8, 3, 15, 42, 9, 500));
check("start of day drops the clock", dayKey(startOfDay(afternoon)), "2026-09-03");
check("start of day is midnight", startOfDay(afternoon).getUTCHours(), 0);
ok("an afternoon and its midnight are the same day", sameDay(afternoon, on("2026-09-03")));
ok("consecutive days are not", !sameDay(on("2026-09-03"), on("2026-09-04")));

/*
 * The conversion between the two frames, and the check that caught the bug
 * the migration then refused to store.
 *
 * A calendar day is UTC midnight because CoverAssignment.date is a Postgres
 * DATE and the migration CHECKs its weekday. A leave date is a timestamp
 * written as local midnight. On a machine on British Summer Time those two
 * are twenty-three hours apart and land on different days, and every one of
 * these assertions was false before dayOf existed.
 */
check("a local midnight is its own day", dayKey(dayOf(stamp("2026-09-03"))), "2026-09-03");
check("so is a local afternoon", dayKey(dayOf(stamp("2026-09-03", 15))), "2026-09-03");
check("and a local minute before midnight", dayKey(dayOf(stamp("2026-09-03", 23))), "2026-09-03");
check("the weekday survives the conversion", isoDayOfWeek(dayOf(stamp("2026-09-03"))), 4);
ok("today is a calendar day", dayKey(today()).length === 10);
check("today is midnight", today().getUTCHours(), 0);
ok(
  "today is the date on the office wall",
  dayKey(today()) ===
    [
      new Date().getFullYear(),
      String(new Date().getMonth() + 1).padStart(2, "0"),
      String(new Date().getDate()).padStart(2, "0"),
    ].join("-"),
);

check("adding days", dayKey(addDays(on("2026-09-03"), 2)), "2026-09-05");
check("adding crosses a month", dayKey(addDays(on("2026-08-31"), 1)), "2026-09-01");
check("subtracting works too", dayKey(addDays(on("2026-09-01"), -1)), "2026-08-31");
check("adding zero is the same day", dayKey(addDays(afternoon, 0)), "2026-09-03");

// -----------------------------------------------------------------------------
// Who is out
// -----------------------------------------------------------------------------

const leave = (staffId: string, from: string, to: string, reason = "Annual leave"): Absence => ({
  staffId,
  from: on(from),
  to: on(to),
  reason,
});

const week = leave("mensah", "2026-08-31", "2026-09-02");

ok("the first day is absent", absentThatDay(week, on("2026-08-31")));
ok("the middle is absent", absentThatDay(week, on("2026-09-01")));

// Both ends inclusive. Leave to Wednesday means Wednesday off, and an
// exclusive end sends somebody home and leaves their lessons showing as
// theirs.
ok("the last day is absent", absentThatDay(week, on("2026-09-02")));
ok("the day after is not", !absentThatDay(week, on("2026-09-03")));
ok("the day before is not", !absentThatDay(week, on("2026-08-30")));

const oneDay = leave("adjei", "2026-09-03", "2026-09-03", "Compassionate leave");
ok("a one-day absence is a day off", absentThatDay(oneDay, on("2026-09-03")));
ok("and only that day", !absentThatDay(oneDay, on("2026-09-04")));

// Leave read straight out of the table, converted at the boundary the way
// the page and the action both do it. Entered at four in the afternoon is not
// half a day off.
const timed: Absence = {
  staffId: "boateng",
  from: dayOf(stamp("2026-09-03", 16)),
  to: dayOf(stamp("2026-09-03", 16)),
  reason: "Sick leave",
};
ok("leave stamped with a time still covers its day", absentThatDay(timed, on("2026-09-03")));
ok("and not the day after", !absentThatDay(timed, on("2026-09-04")));
ok("nor the day before", !absentThatDay(timed, on("2026-09-02")));

const absences = [week, oneDay, leave("mensah", "2026-09-03", "2026-09-03", "Sick leave")];

check("nobody is out on a clear day", [...absentOn(absences, on("2026-09-10")).keys()], []);
check(
  "two are out on the third",
  [...absentOn(absences, on("2026-09-03")).keys()].sort(),
  ["adjei", "mensah"],
);
check("the reason comes through", absentOn(absences, on("2026-09-03")).get("adjei"), "Compassionate leave");
check(
  "overlapping rows name one reason",
  absentOn(absences, on("2026-09-03")).get("mensah"),
  "Sick leave",
);
check("one is out on the first", [...absentOn(absences, on("2026-09-01")).keys()], ["mensah"]);

// -----------------------------------------------------------------------------
// The timetable for a Thursday
//
// Four teachers, one day, laid out so the ranking has something to choose
// between. Mensah and Owusu teach mathematics; Adjei teaches English; Bediako
// teaches English too and is in the same department as Adjei.
// -----------------------------------------------------------------------------

const lesson = (over: Partial<Lesson> & { slotId: string }): Lesson => ({
  dayOfWeek: 4,
  periodIndex: 1,
  startTime: "07:30",
  endTime: "08:10",
  staffId: "mensah",
  subjectId: "maths",
  subject: "Mathematics",
  className: "JHS 2 Amber",
  room: null,
  ...over,
});

const timetable: Lesson[] = [
  // Period 3, 08:50: Mensah is away, so this is the hole.
  lesson({ slotId: "hole", periodIndex: 3, startTime: "08:50", endTime: "09:30" }),

  // Owusu teaches maths but is in front of a class at 08:50.
  lesson({
    slotId: "owusu-busy",
    periodIndex: 3,
    startTime: "08:50",
    endTime: "09:30",
    staffId: "owusu",
    className: "JHS 1 Blue",
  }),
  // and is free later.
  lesson({
    slotId: "owusu-earlier",
    periodIndex: 1,
    staffId: "owusu",
    className: "JHS 3 Gold",
  }),

  // Adjei is free at 08:50 and teaches English.
  lesson({
    slotId: "adjei-1",
    periodIndex: 1,
    staffId: "adjei",
    subjectId: "english",
    subject: "English Language",
    className: "JHS 1 Blue",
  }),

  // Bediako, English department, free all morning.
  lesson({
    slotId: "bediako-late",
    periodIndex: 8,
    startTime: "12:00",
    endTime: "12:40",
    staffId: "bediako",
    subjectId: "english",
    subject: "English Language",
    className: "JHS 3 Gold",
  }),

  // A Friday lesson, to prove the day filter does something.
  lesson({ slotId: "friday", dayOfWeek: 5, periodIndex: 3, startTime: "08:50", endTime: "09:30" }),
];

const teachers: Teacher[] = [
  { staffId: "mensah", name: "Mr Mensah", department: "Mathematics", specialisations: [], isTeaching: true },
  { staffId: "owusu", name: "Mrs Owusu", department: "Mathematics", specialisations: [], isTeaching: true },
  { staffId: "adjei", name: "Mr Adjei", department: "English", specialisations: [], isTeaching: true },
  { staffId: "bediako", name: "Ms Bediako", department: "English", specialisations: [], isTeaching: true },
  { staffId: "quaye", name: "Mr Quaye", department: "Mathematics", specialisations: ["Mathematics"], isTeaching: true },
  { staffId: "bursar", name: "Mr Nkrumah", department: "Finance", specialisations: [], isTeaching: false },
];

const thursday = on("2026-09-03");
const out = absentOn([leave("mensah", "2026-09-03", "2026-09-03", "Sick leave")], thursday);

const holes = periodsToCover(timetable, out, thursday);
check("one hole on the Thursday", holes.length, 1);
check("and it is the right one", holes[0]?.slotId, "hole");

check("nobody out is nothing to cover", periodsToCover(timetable, new Map(), thursday).length, 0);

// The Friday row belongs to the same absent teacher and must not appear on the
// Thursday board. This is the check that catches a day filter written against
// getDay(), which numbers Sunday zero.
check(
  "another weekday is not this day",
  periodsToCover(timetable, out, on("2026-09-04")).map((l) => l.slotId),
  ["friday"],
);

check(
  "a whole week out is every one of their periods",
  periodsToCover(timetable, absentOn([leave("owusu", "2026-08-31", "2026-09-04")], thursday), thursday)
    .map((l) => l.slotId)
    .sort(),
  ["owusu-busy", "owusu-earlier"],
);

// Sorted by the clock, which is the order the morning happens in.
const twoHoles = periodsToCover(
  timetable,
  absentOn([leave("owusu", "2026-09-03", "2026-09-03")], thursday),
  thursday,
);
check("holes come in time order", twoHoles.map((l) => l.startTime), ["07:30", "08:50"]);

// -----------------------------------------------------------------------------
// Who is free
// -----------------------------------------------------------------------------

const hole = holes[0]!;
const noCover: Arrangement[] = [];

const busy = busyAt(hole, 4, timetable, noCover, out);

check("the absent teacher is busy being absent", busy.get("mensah"), "Sick leave");
check("a teacher in a room is busy", busy.get("owusu"), "Teaching Mathematics, JHS 1 Blue");
ok("somebody free is not listed", !busy.has("adjei"));
ok("somebody teaching elsewhere in the day is not listed", !busy.has("bediako"));

// Touching is not overlapping: the period before ends at 08:50 and this one
// starts at 08:50, which is the normal shape of a school day.
ok("the period before does not make you busy", !busy.has("quaye"));

const withCover = busyAt(hole, 4, timetable, [{ slotId: "hole", kind: "TEACHER", coverStaffId: "adjei" }], out);
check("somebody already covering is busy", withCover.get("adjei"), "Already covering JHS 2 Amber");

// Cover on a different day must not follow the person around.
const otherDay = busyAt(hole, 4, timetable, [{ slotId: "friday", kind: "TEACHER", coverStaffId: "adjei" }], out);
ok("cover on another day does not make you busy today", !otherDay.has("adjei"));

// A cover row pointing at a slot that is not in the list must not throw.
const orphan = busyAt(hole, 4, timetable, [{ slotId: "gone", kind: "TEACHER", coverStaffId: "adjei" }], out);
ok("a cover row for a deleted period is ignored", !orphan.has("adjei"));

check("teaching load counts a day", teachingLoad(timetable, "owusu", 4), 2);
check("and not another day", teachingLoad(timetable, "mensah", 5), 1);
check("somebody with no lessons has none", teachingLoad(timetable, "bursar", 4), 0);

check(
  "cover tally counts per person",
  [...coverTally([
    { slotId: "a", kind: "TEACHER", coverStaffId: "adjei" },
    { slotId: "b", kind: "SUPERVISED", coverStaffId: "adjei" },
    { slotId: "c", kind: "TEACHER", coverStaffId: "bediako" },
    { slotId: "d", kind: "CANCELLED", coverStaffId: null },
  ]).entries()].sort(),
  [["adjei", 2], ["bediako", 1]],
);

// -----------------------------------------------------------------------------
// The order names come in
// -----------------------------------------------------------------------------

const ranked = rankCandidates(hole, teachers, timetable, noCover, out);
const names = ranked.map((candidate) => candidate.staffId);

ok("the absent teacher is not offered", !names.includes("mensah"));
ok("a teacher in a room is not offered", !names.includes("owusu"));
ok("non-teaching staff are not offered", !names.includes("bursar"));

// Quaye teaches mathematics by specialisation and is free, so he goes first
// even though Adjei and Bediako are also free. The lesson happens rather than
// the class being minded.
check("the subject teacher comes first", names[0], "quaye");
check("and it says why", ranked[0]?.because, "Teaches Mathematics");

// Adjei and Bediako are both English, so neither is in the maths department:
// their reason is simply that they are free.
check("everybody free is offered", names.length, 3);
check("the rest are offered as free", ranked[1]?.because, "Free this period");

// Somebody who already has cover today drops down the list. Two people equally
// qualified, and the one who has not been asked yet is offered first.
const asked = rankCandidates(
  lesson({ slotId: "hole2", periodIndex: 3, startTime: "08:50", endTime: "09:30", subjectId: "english", subject: "English Language" }),
  teachers,
  timetable,
  [{ slotId: "adjei-1", kind: "TEACHER", coverStaffId: "adjei" }],
  out,
);
check(
  "the person not yet asked comes first",
  asked.map((candidate) => candidate.staffId),
  ["bediako", "adjei", "quaye"],
);
check("and the tally is shown", asked.find((c) => c.staffId === "adjei")?.coveringToday, 1);

// Ties break on the name, so the same day produces the same list twice. A
// ranking that shuffles makes two people believe two different things.
check(
  "ties break alphabetically",
  rankCandidates(hole, teachers, timetable, noCover, out).map((c) => c.staffId),
  names,
);

/*
 * The person currently covering a period is still a candidate for it.
 *
 * Without this the one name the dropdown cannot show is the name printed above
 * it, because the reason they are unavailable is the row being edited. The
 * screen showed exactly that, and it is the same filtering refusal() does, so
 * the two agree about who may take a lesson.
 */
const settled = rankCandidates(
  hole,
  teachers,
  timetable,
  [{ slotId: "hole", kind: "TEACHER", coverStaffId: "adjei" }],
  out,
);
ok("whoever is covering a period is offered for it", settled.some((c) => c.staffId === "adjei"));
check(
  "and their own cover is not counted against them",
  settled.find((c) => c.staffId === "adjei")?.coveringToday,
  0,
);
ok(
  "the screen and the action agree",
  refusal(hole, "TEACHER", "adjei", "", timetable, [{ slotId: "hole", kind: "TEACHER", coverStaffId: "adjei" }], out) === null &&
    settled.some((c) => c.staffId === "adjei"),
);

// Cover on a DIFFERENT period at the same time still rules somebody out, which
// is the half of it that must not be lost to the fix above.
const clash = rankCandidates(
  lesson({ slotId: "third", periodIndex: 3, startTime: "08:50", endTime: "09:30", className: "Basic 6 A" }),
  teachers,
  timetable,
  [{ slotId: "hole", kind: "TEACHER", coverStaffId: "adjei" }],
  out,
);
ok("somebody covering another class at that minute is not offered", !clash.some((c) => c.staffId === "adjei"));

// A free period is not free time. The list still offers the third cover of the
// day; it just says so.
const tired = rankCandidates(
  hole,
  teachers,
  timetable,
  [
    { slotId: "adjei-1", kind: "TEACHER", coverStaffId: "adjei" },
    { slotId: "bediako-late", kind: "TEACHER", coverStaffId: "adjei" },
  ],
  out,
);
check(
  "somebody covering twice already is cautioned",
  tired.find((c) => c.staffId === "adjei")?.caution,
  "Already covering 2 periods today",
);
ok("but still offered", tired.some((c) => c.staffId === "adjei"));
check("somebody with a light day is not cautioned", tired.find((c) => c.staffId === "quaye")?.caution, null);

// -----------------------------------------------------------------------------
// What may be written down
// -----------------------------------------------------------------------------

check("a kind nobody has heard of is refused", refusal(hole, "SOMEHOW", "adjei", "", timetable, noCover, out), "Choose what happens to the period.");
check("an empty kind is refused", refusal(hole, "", "adjei", "", timetable, noCover, out), "Choose what happens to the period.");
check("a free teacher is accepted", refusal(hole, "TEACHER", "adjei", "", timetable, noCover, out), null);
check("supervision is accepted", refusal(hole, "SUPERVISED", "adjei", "", timetable, noCover, out), null);
check("merging is accepted", refusal(hole, "MERGED", "bediako", "", timetable, noCover, out), null);

check(
  "cover with nobody named is refused",
  refusal(hole, "TEACHER", null, "", timetable, noCover, out),
  "Choose who is taking the lesson.",
);

check(
  "the absent teacher cannot cover for themselves",
  refusal(hole, "TEACHER", "mensah", "", timetable, noCover, out),
  "That is the teacher who is away. Somebody else has to take it.",
);

check(
  "a teacher already in a room is refused",
  refusal(hole, "TEACHER", "owusu", "", timetable, noCover, out),
  "They are teaching Mathematics, JHS 1 Blue at that time.",
);

// Adjei is free at noon and has been given the noon period in JHS 3 Gold, so
// a second noon period is refused for the cover rather than for the teaching.
const already: Arrangement[] = [{ slotId: "bediako-late", kind: "TEACHER", coverStaffId: "adjei" }];
check(
  "somebody covering elsewhere at that time is refused",
  refusal(
    lesson({ slotId: "another", periodIndex: 8, startTime: "12:00", endTime: "12:40", staffId: "mensah" }),
    "TEACHER",
    "adjei",
    "",
    timetable,
    already,
    out,
  ),
  "Already covering JHS 3 Gold at that time.",
);

// Editing an existing arrangement must not refuse on the grounds of itself.
check(
  "changing the note on your own cover is allowed",
  refusal(hole, "TEACHER", "adjei", "Exercise 4B", timetable, [{ slotId: "hole", kind: "TEACHER", coverStaffId: "adjei" }], out),
  null,
);

check(
  "a lost period with somebody named is refused",
  refusal(hole, "CANCELLED", "adjei", "No cover", timetable, noCover, out),
  "A lost period has nobody covering it. Choose somebody, or say the period is lost.",
);

check(
  "a lost period with no reason is refused",
  refusal(hole, "CANCELLED", null, "   ", timetable, noCover, out),
  "Say why the period is being lost. A blank one is the row nobody can answer for at the end of term.",
);

check(
  "a lost period with a reason is accepted",
  refusal(hole, "CANCELLED", null, "Nobody free in the whole school", timetable, noCover, out),
  null,
);

// -----------------------------------------------------------------------------
// Kinds
// -----------------------------------------------------------------------------

check("four kinds", COVER_KINDS.length, 4);
check("every kind has a label and a hint", COVER_KINDS.every((k) => k.label && k.hint), true);
check("labels are unique", new Set(COVER_KINDS.map((k) => k.label)).size, 4);
check("a known kind is labelled", kindLabel("SUPERVISED"), "Supervised, set work");
check("an unknown kind is shown as itself", kindLabel("MYSTERY"), "MYSTERY");
check("a covered period reads well", kindTone("TEACHER"), "success");
check("a lost period reads badly", kindTone("CANCELLED"), "danger");
check("minding sits between the two", kindTone("SUPERVISED"), "warning");
check("an unknown kind has no tone", kindTone("MYSTERY"), "neutral");
ok("only cancelling loses the period", isLost("CANCELLED") && !isLost("SUPERVISED") && !isLost("TEACHER") && !isLost("MERGED"));

// -----------------------------------------------------------------------------
// The board
// -----------------------------------------------------------------------------

const arranged: Arrangement[] = [
  { slotId: "hole", kind: "TEACHER", coverStaffId: "adjei" },
  { slotId: "adjei-1", kind: "SUPERVISED", coverStaffId: "adjei" },
  { slotId: "owusu-busy", kind: "TEACHER", coverStaffId: "bediako" },
  { slotId: "owusu-earlier", kind: "CANCELLED", coverStaffId: null },
  { slotId: "gone", kind: "TEACHER", coverStaffId: "quaye" },
];

const board = slips(arranged, timetable);
check("a slip per person", board.map((slip) => slip.staffId), ["adjei", "bediako"]);
check("the busiest first", board[0]?.periods.length, 2);
check("their periods are in time order", board[0]?.periods.map((p) => p.lesson.startTime), ["07:30", "08:50"]);
check("a lost period is on nobody's slip", board.every((slip) => slip.periods.every((p) => p.kind !== "CANCELLED")), true);
check("a slip for a deleted period is dropped", board.every((slip) => slip.staffId !== "quaye"), true);
check("nothing arranged is no slips", slips([], timetable).length, 0);

// -----------------------------------------------------------------------------
// The numbers at the top
// -----------------------------------------------------------------------------

const dayOut = absentOn(
  [leave("mensah", "2026-09-03", "2026-09-03"), leave("owusu", "2026-09-03", "2026-09-03"), leave("bursar", "2026-09-03", "2026-09-03")],
  thursday,
);
const dayHoles = periodsToCover(timetable, dayOut, thursday);
check("three periods to cover", dayHoles.length, 3);

const partly = summarise(
  dayHoles,
  [
    { slotId: "hole", kind: "TEACHER", coverStaffId: "adjei" },
    { slotId: "owusu-busy", kind: "CANCELLED", coverStaffId: null },
  ],
  dayOut,
);

check("periods affected", partly.affected, 3);
check("periods arranged", partly.arranged, 1);
check("periods written off", partly.lost, 1);
check("periods nobody has dealt with", partly.uncovered, 1);

// Somebody absent who was not due to teach anything is not "out" on a board
// about lessons. The bursar being on leave is true and is not this screen's
// business.
check("only teachers with lessons are counted out", partly.out, 2);

check(
  "everything arranged is nothing uncovered",
  summarise(dayHoles, dayHoles.map((l) => ({ slotId: l.slotId, kind: "TEACHER" as const, coverStaffId: "adjei" })), dayOut).uncovered,
  0,
);

const quiet = summarise([], [], new Map());
check("a quiet day is all zeroes", [quiet.out, quiet.affected, quiet.arranged, quiet.uncovered, quiet.lost], [0, 0, 0, 0, 0]);

// An arrangement for a period that is no longer a hole (leave was cancelled)
// must not be counted as covering anything.
check(
  "cover for a period nobody is away for counts nothing",
  summarise([], [{ slotId: "hole", kind: "TEACHER", coverStaffId: "adjei" }], new Map()).arranged,
  0,
);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} cover checks passed.`);
