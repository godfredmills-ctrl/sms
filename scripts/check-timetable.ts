/**
 * Tests for the timetable's arithmetic and its generator.
 *
 * Two things get most of the attention. The clash check, because it is the
 * thing the write path now refuses on, and a check that is wrong in the
 * permissive direction puts a teacher in two rooms while telling everybody it
 * did not. And the generator, because a timetable that looks plausible and
 * double-books somebody is worse than no timetable: the mistake is discovered
 * by two classes sitting waiting for the same person.
 *
 * The generator's own output is fed back through the clash check at the end,
 * which is the assertion that matters most in this file.
 */

import {
  DAYS,
  DEFAULT_PERIODS,
  adjacent,
  allClashes,
  ceiling,
  dayLabel,
  findClash,
  generateTimetable,
  isUnavailable,
  minutesOf,
  overlaps,
  perDay,
  periodProblems,
  shortfalls,
  teachable,
  teacherLoad,
  teacherPressure,
  type Demand,
  type Period,
  type Placement,
} from "../src/lib/timetable-rules";

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

// -----------------------------------------------------------------------------
// Time
// -----------------------------------------------------------------------------

check("midnight", minutesOf("00:00"), 0);
check("half past seven", minutesOf("07:30"), 450);
check("a single-digit hour", minutesOf("7:30"), 450);
check("the last minute of the day", minutesOf("23:59"), 1439);
check("a nonsense hour is not a time", minutesOf("24:00"), null);
check("nor a nonsense minute", minutesOf("07:60"), null);
check("nor a word", minutesOf("morning"), null);
check("nor nothing", minutesOf(""), null);
check("nor null", minutesOf(null), null);
check("surrounding space is ignored", minutesOf(" 08:10 "), 490);

const p1 = { startTime: "08:00", endTime: "08:40" };
const p2 = { startTime: "08:40", endTime: "09:20" };
const p3 = { startTime: "08:20", endTime: "09:00" };

ok("a period does not overlap the next one", !overlaps(p1, p2));
ok("touching is not overlapping, either way round", !overlaps(p2, p1));
ok("a period straddling two does overlap", overlaps(p1, p3));
ok("and overlaps the other one too", overlaps(p3, p2));
ok("a period overlaps itself", overlaps(p1, p1));
ok(
  "a period wholly inside another overlaps it",
  overlaps({ startTime: "08:00", endTime: "09:00" }, { startTime: "08:10", endTime: "08:20" }),
);
ok(
  "an unreadable time is not evidence of a clash",
  !overlaps(p1, { startTime: "eight", endTime: "nine" }),
);

ok("back to back is adjacent", adjacent(p1, p2));
ok("but not in the other order", !adjacent(p2, p1));
ok("a gap is not adjacent", !adjacent(p1, { startTime: "09:00", endTime: "09:40" }));

// -----------------------------------------------------------------------------
// The bell schedule
// -----------------------------------------------------------------------------

check("the default day has no problems", periodProblems(DEFAULT_PERIODS), []);
check(
  "the default day teaches in nine of its eleven periods",
  teachable(DEFAULT_PERIODS).length,
  9,
);
ok(
  "and neither of the other two is teachable",
  DEFAULT_PERIODS.filter((period) => period.isBreak).length === 2,
);

check(
  "a period that ends before it starts is reported",
  periodProblems([{ periodIndex: 1, startTime: "09:00", endTime: "08:00", isBreak: false }]),
  ["Period 1 ends before it starts."],
);
check(
  "an unreadable time is reported rather than ignored",
  periodProblems([{ periodIndex: 1, startTime: "oops", endTime: "08:00", isBreak: false }]),
  ["Period 1 has no readable start time."],
);
check(
  "two periods with the same index are reported",
  periodProblems([
    { periodIndex: 1, startTime: "08:00", endTime: "08:40", isBreak: false },
    { periodIndex: 1, startTime: "09:00", endTime: "09:40", isBreak: false },
  ]),
  ["Period 1 is listed twice."],
);
check(
  "overlapping periods are reported",
  periodProblems([
    { periodIndex: 1, startTime: "08:00", endTime: "08:45", isBreak: false },
    { periodIndex: 2, startTime: "08:40", endTime: "09:20", isBreak: false },
  ]),
  ["Period 1 and period 2 overlap."],
);
check("an empty schedule has no problems to report", periodProblems([]), []);

check("day 1 is Monday", dayLabel(1), "Monday");
check("day 5 is Friday", dayLabel(5), "Friday");
check("an unknown day names nothing", dayLabel(0), "");
ok("every day value is distinct", new Set(DAYS.map((d) => d.value)).size === DAYS.length);

// -----------------------------------------------------------------------------
// Clashes
// -----------------------------------------------------------------------------

/**
 * A placement, with a default for anything not given.
 *
 * The nullable fields are read with `in` rather than `??`, because `??` treats
 * an explicit null as "not given" and hands back the default. Written the
 * obvious way, `place({ offeringId: null })` produced a slot with a subject in
 * it, and the free-period test passed against a lesson.
 */
const place = (over: Partial<Placement> = {}): Placement => ({
  id: over.id,
  classSectionId: over.classSectionId ?? "jhs1a",
  dayOfWeek: over.dayOfWeek ?? 1,
  periodIndex: over.periodIndex ?? 1,
  startTime: over.startTime ?? "08:00",
  endTime: over.endTime ?? "08:40",
  offeringId: "offeringId" in over ? over.offeringId! : "maths-jhs1a",
  staffIds: over.staffIds ?? ["mrosei"],
  room: "room" in over ? (over.room ?? null) : null,
});

const existing = [place({ id: "a" })];

check("an empty timetable clashes with nothing", findClash([], place()), null);
check(
  "a different day is not a clash",
  findClash(existing, place({ dayOfWeek: 2, classSectionId: "jhs2a" })),
  null,
);
check(
  "a different time is not a clash",
  findClash(
    existing,
    place({ classSectionId: "jhs2a", startTime: "09:00", endTime: "09:40" }),
  ),
  null,
);
check(
  "back to back is not a clash",
  findClash(
    existing,
    place({ classSectionId: "jhs2a", startTime: "08:40", endTime: "09:20" }),
  ),
  null,
);

const teacherClash = findClash(existing, place({ classSectionId: "jhs2a" }));
check("the same teacher at the same time is a clash", teacherClash?.kind, "teacher");
check("and names who", teacherClash?.subject, "mrosei");
check("and what they are already doing", teacherClash?.with.id, "a");

// The reason the page's own version was rewritten: period numbers do not line
// up between classes, so a clash has to be found on the clock.
const overlapping = findClash(
  existing,
  place({ classSectionId: "jhs2a", periodIndex: 4, startTime: "08:20", endTime: "09:00" }),
);
check("an overlap with a different period number is still a clash", overlapping?.kind, "teacher");

const differentIndexNoOverlap = findClash(
  existing,
  place({ classSectionId: "jhs2a", periodIndex: 1, startTime: "10:00", endTime: "10:40" }),
);
check("and the same period number at a different time is not", differentIndexNoOverlap, null);

const coTeaching = findClash(
  [place({ id: "a", staffIds: ["mrosei", "mslartey"] })],
  place({ classSectionId: "jhs2a", staffIds: ["mslartey"] }),
);
check("a co-teacher is a person too", coTeaching?.kind, "teacher");
check("and is named", coTeaching?.subject, "mslartey");

const classClash = findClash(
  existing,
  place({ offeringId: "english-jhs1a", staffIds: ["msaddo"] }),
);
check("a class in two lessons at once is a clash", classClash?.kind, "class");

const roomClash = findClash(
  [place({ id: "a", room: "Lab 1" })],
  place({ classSectionId: "jhs2a", staffIds: ["msaddo"], room: "lab 1" }),
);
check("a room booked twice is a clash", roomClash?.kind, "room");
check("regardless of how it was typed", roomClash?.subject, "lab 1");

check(
  "no room set is not a room clash",
  findClash(
    [place({ id: "a", room: null })],
    place({ classSectionId: "jhs2a", staffIds: ["msaddo"], room: null }),
  ),
  null,
);

// Replacing a slot is not clashing with the slot being replaced.
check(
  "a slot does not clash with itself",
  findClash([place({ id: "a" })], place({ id: "a", offeringId: "english-jhs1a" })),
  null,
);

/*
 * Two placements that have no ids yet still clash.
 *
 * This is the one that mattered. Written as `other.id !== candidate.id`, the
 * self-exclusion also excused every pair where neither had an id, because
 * undefined is not unequal to undefined. Nothing being considered for a slot
 * has an id, so the generator compared each candidate against nothing and put
 * forty periods into a nine period day while every check downstream agreed it
 * was fine.
 */
const bothNew = findClash(
  [place({ id: undefined })],
  place({ id: undefined, classSectionId: "jhs2a" }),
);
check("two unsaved placements still clash", bothNew?.kind, "teacher");
check(
  "an unsaved one clashes with a saved one",
  findClash([place({ id: "a" })], place({ id: undefined, classSectionId: "jhs2a" }))?.kind,
  "teacher",
);
check(
  "and a saved one with an unsaved one",
  findClash([place({ id: undefined })], place({ id: "a", classSectionId: "jhs2a" }))?.kind,
  "teacher",
);

// A teacher clash is reported before a class clash, because it is the one that
// leaves somebody standing in a corridor.
const both = findClash(
  [place({ id: "a" })],
  place({ offeringId: "english-jhs1a", staffIds: ["mrosei"] }),
);
check("the teacher is reported before the class", both?.kind, "teacher");

check("a free period clashes with nothing", findClash(existing, place({ offeringId: null, classSectionId: "jhs2a", staffIds: [] })), null);

const everything = [
  place({ id: "a" }),
  place({ id: "b", classSectionId: "jhs2a" }),
  place({ id: "c", classSectionId: "jhs3a", dayOfWeek: 2, staffIds: ["msaddo"] }),
];
const map = allClashes(everything);
check("both sides of a clash are reported", map.size, 2);
ok("the innocent one is not", !map.has("c"));
check("nothing clashes on an empty timetable", allClashes([]).size, 0);

// -----------------------------------------------------------------------------
// Load and shape
// -----------------------------------------------------------------------------

const week = [
  place({ id: "1", dayOfWeek: 1 }),
  place({ id: "2", dayOfWeek: 1, startTime: "09:00", endTime: "09:40" }),
  place({ id: "3", dayOfWeek: 3, classSectionId: "jhs2a" }),
  place({ id: "4", dayOfWeek: 3, classSectionId: "jhs3a", staffIds: ["mrosei", "mslartey"] }),
];

const load = teacherLoad(week);
check("a teacher's week is counted", load.get("mrosei"), 4);
check("and a co-teacher's", load.get("mslartey"), 1);
check("nobody else appears", load.size, 2);
check("a free period counts for nobody", teacherLoad([place({ offeringId: null })]).size, 0);
check(
  "one person listed twice on a slot is one period",
  teacherLoad([place({ staffIds: ["mrosei", "mrosei"] })]).get("mrosei"),
  1,
);

const spread = perDay(week, "maths-jhs1a");
check("two on Monday", spread.get(1), 2);
check("two on Wednesday", spread.get(3), 2);
check("and nothing on Friday", spread.get(5), undefined);

// -----------------------------------------------------------------------------
// Unavailability
// -----------------------------------------------------------------------------

const rules = [
  { staffId: "mrosei", dayOfWeek: 1, periodIndex: null },
  { staffId: "mslartey", dayOfWeek: 3, periodIndex: 4 },
];

ok("a whole day off covers every period", isUnavailable(rules, ["mrosei"], 1, 7));
ok("and every other one", isUnavailable(rules, ["mrosei"], 1, 1));
ok("but not another day", !isUnavailable(rules, ["mrosei"], 2, 1));
ok("one period off covers that period", isUnavailable(rules, ["mslartey"], 3, 4));
ok("and not the one beside it", !isUnavailable(rules, ["mslartey"], 3, 5));
ok("somebody with no rules is always available", !isUnavailable(rules, ["msaddo"], 1, 1));
ok("a co-teacher's absence counts", isUnavailable(rules, ["msaddo", "mrosei"], 1, 3));
ok("nobody at all is available", !isUnavailable(rules, [], 1, 1));

// -----------------------------------------------------------------------------
// Generating
// -----------------------------------------------------------------------------

const WEEKDAYS = [1, 2, 3, 4, 5];

const demand = (over: Partial<Demand> = {}): Demand => ({
  offeringId: over.offeringId ?? "o1",
  classSectionId: over.classSectionId ?? "jhs1a",
  staffIds: over.staffIds ?? ["t1"],
  periodsPerWeek: over.periodsPerWeek ?? 5,
  doublePeriods: over.doublePeriods ?? 0,
  room: over.room ?? null,
  label: over.label ?? "Mathematics, JHS 1 A",
});

const empty = generateTimetable({
  demands: [],
  periods: DEFAULT_PERIODS,
  days: WEEKDAYS,
  unavailable: [],
});
check("nothing asked for places nothing", empty.placed, 0);
check("and reports no shortfall", empty.shortfalls.length, 0);

const one = generateTimetable({
  demands: [demand()],
  periods: DEFAULT_PERIODS,
  days: WEEKDAYS,
  unavailable: [],
});
check("five periods asked for", one.wanted, 5);
check("five placed", one.placed, 5);
check("nothing short", one.shortfalls.length, 0);
check("nothing clashes", allClashes(one.placements.map((p, i) => ({ ...p, id: String(i) }))).size, 0);
ok("and never in a break", one.placements.every((p) => ![5, 9].includes(p.periodIndex)));

// Five periods across five days should land one a day, which is the whole
// reason the spread term exists.
check(
  "five periods spread one to a day",
  new Set(one.placements.map((p) => p.dayOfWeek)).size,
  5,
);

// A determinism check, because a generator nobody can reproduce is one nobody
// can tell they have improved.
const again = generateTimetable({
  demands: [demand()],
  periods: DEFAULT_PERIODS,
  days: WEEKDAYS,
  unavailable: [],
});
check(
  "the same input gives the same timetable",
  JSON.stringify(again.placements),
  JSON.stringify(one.placements),
);

// A whole school's worth: four classes, four subjects each, sharing teachers.
const school: Demand[] = [];
for (const section of ["jhs1a", "jhs1b", "jhs2a", "jhs2b"]) {
  for (const [subject, teacher, periods] of [
    ["maths", "t-maths", 5],
    ["english", "t-english", 5],
    ["science", "t-science", 4],
    ["social", "t-social", 3],
  ] as const) {
    school.push(
      demand({
        offeringId: `${subject}-${section}`,
        classSectionId: section,
        staffIds: [teacher],
        periodsPerWeek: periods,
        label: `${subject} ${section}`,
      }),
    );
  }
}

const built = generateTimetable({
  demands: school,
  periods: DEFAULT_PERIODS,
  days: WEEKDAYS,
  unavailable: [],
});

check("a whole school asks for sixty-eight periods", built.wanted, 68);
check("and every one is placed", built.placed, 68);
check("with nothing short", built.shortfalls.length, 0);

// The assertion this whole file exists for.
const withIds = built.placements.map((placement, index) => ({
  ...placement,
  id: String(index),
}));
check("and not one clash in the result", allClashes(withIds).size, 0);

const builtLoad = teacherLoad(withIds);
check("the maths teacher takes twenty periods", builtLoad.get("t-maths"), 20);
check("the social studies teacher twelve", builtLoad.get("t-social"), 12);

// Doubles.
const withDouble = generateTimetable({
  demands: [demand({ periodsPerWeek: 4, doublePeriods: 2 })],
  periods: DEFAULT_PERIODS,
  days: WEEKDAYS,
  unavailable: [],
});
check("four periods with one double", withDouble.placed, 4);

const byDay = new Map<number, typeof withDouble.placements>();
for (const placement of withDouble.placements) {
  byDay.set(placement.dayOfWeek, [...(byDay.get(placement.dayOfWeek) ?? []), placement]);
}
const pairedDay = [...byDay.values()].find((day) => day.length === 2);
ok("the pair lands on one day", Boolean(pairedDay));
ok(
  "and back to back",
  Boolean(
    pairedDay &&
      pairedDay
        .sort((a, b) => a.periodIndex - b.periodIndex)
        .every((_, index, all) => index === 0 || adjacent(all[index - 1], all[index])),
  ),
);

// A double never straddles a break, because two periods with lunch between
// them are not one lesson.
const breakStraddle = generateTimetable({
  demands: [demand({ periodsPerWeek: 2, doublePeriods: 2 })],
  periods: [
    { periodIndex: 1, startTime: "08:00", endTime: "08:40", isBreak: false },
    { periodIndex: 2, startTime: "08:40", endTime: "09:10", isBreak: true, label: "Break" },
    { periodIndex: 3, startTime: "09:10", endTime: "09:50", isBreak: false },
  ],
  days: [1],
  unavailable: [],
});
check("a double cannot be placed across a break", breakStraddle.placed, 0);
check("and says so", breakStraddle.shortfalls.length, 1);

// Unavailability.
const partTime = generateTimetable({
  demands: [demand({ periodsPerWeek: 3, staffIds: ["t-part"] })],
  periods: DEFAULT_PERIODS,
  days: WEEKDAYS,
  unavailable: [
    { staffId: "t-part", dayOfWeek: 1, periodIndex: null },
    { staffId: "t-part", dayOfWeek: 2, periodIndex: null },
    { staffId: "t-part", dayOfWeek: 4, periodIndex: null },
  ],
});
check("a part-time teacher still gets their three periods", partTime.placed, 3);
ok(
  "and none of them on a day they are not in",
  partTime.placements.every((placement) => [3, 5].includes(placement.dayOfWeek)),
);

// More asked for than the week holds.
const overloaded = generateTimetable({
  demands: [demand({ periodsPerWeek: 40 })],
  periods: DEFAULT_PERIODS,
  days: [1],
  unavailable: [],
});
ok("an impossible demand places what it can", overloaded.placed > 0);
ok("and no more than the day holds", overloaded.placed <= 9);
check("and reports the shortfall", overloaded.shortfalls.length, 1);
check("naming the subject", overloaded.shortfalls[0].label, "Mathematics, JHS 1 A");
check("and what it wanted", overloaded.shortfalls[0].wanted, 40);

// Existing slots are respected.
const monday: Placement[] = [
  {
    id: "fixed-1",
    classSectionId: "jhs1a",
    dayOfWeek: 1,
    periodIndex: 1,
    startTime: "07:30",
    endTime: "08:10",
    offeringId: "assembly",
    staffIds: [],
    room: null,
  },
];
const around = generateTimetable({
  demands: [demand({ periodsPerWeek: 5 })],
  periods: DEFAULT_PERIODS,
  days: WEEKDAYS,
  unavailable: [],
  fixed: monday,
});
check("what is already there is not returned again", around.placements.length, 5);
ok(
  "and nothing is placed on top of it",
  !around.placements.some(
    (placement) => placement.dayOfWeek === 1 && placement.periodIndex === 1,
  ),
);

// Two subjects sharing one teacher across two classes cannot be simultaneous.
const shared = generateTimetable({
  demands: [
    demand({ offeringId: "a", classSectionId: "s1", staffIds: ["t"], periodsPerWeek: 5 }),
    demand({ offeringId: "b", classSectionId: "s2", staffIds: ["t"], periodsPerWeek: 5 }),
  ],
  periods: DEFAULT_PERIODS,
  days: WEEKDAYS,
  unavailable: [],
});
check("both classes are served", shared.placed, 10);
check(
  "and the shared teacher is never in two rooms",
  allClashes(shared.placements.map((p, i) => ({ ...p, id: String(i) }))).size,
  0,
);

check("nothing short when everything fits", shortfalls([demand({ periodsPerWeek: 1 })], [
  place({ offeringId: "o1" }),
]).length, 0);

// -----------------------------------------------------------------------------
// Who cannot possibly be timetabled
// -----------------------------------------------------------------------------

const stretched: Demand[] = [];
for (const section of ["s1", "s2", "s3"]) {
  stretched.push(
    demand({
      offeringId: `maths-${section}`,
      classSectionId: section,
      staffIds: ["only-teacher"],
      periodsPerWeek: 20,
      label: `Mathematics ${section}`,
    }),
  );
}

const pressure = teacherPressure(stretched, DEFAULT_PERIODS, WEEKDAYS);
check("one teacher, three classes, twenty periods each", pressure[0].wanted, 60);
check("and a week that holds forty-five", pressure[0].capacity, 45);
ok("which is not possible", pressure[0].impossible);

const comfortable = teacherPressure(
  [demand({ staffIds: ["t"], periodsPerWeek: 5 })],
  DEFAULT_PERIODS,
  WEEKDAYS,
);
ok("five periods is not a problem", !comfortable[0].impossible);
check("and nobody else is listed", comfortable.length, 1);

check(
  "time off comes out of what somebody can teach",
  teacherPressure([demand({ staffIds: ["t"] })], DEFAULT_PERIODS, WEEKDAYS, [
    { staffId: "t", dayOfWeek: 1, periodIndex: null },
  ])[0].capacity,
  36,
);
check(
  "one period off is one period less",
  teacherPressure([demand({ staffIds: ["t"] })], DEFAULT_PERIODS, WEEKDAYS, [
    { staffId: "t", dayOfWeek: 1, periodIndex: 1 },
  ])[0].capacity,
  44,
);
check("the busiest is listed first", teacherPressure([
  demand({ offeringId: "a", staffIds: ["quiet"], periodsPerWeek: 2 }),
  demand({ offeringId: "b", staffIds: ["busy"], periodsPerWeek: 30 }),
], DEFAULT_PERIODS, WEEKDAYS)[0].staffId, "busy");
check("nobody teaching is nobody listed", teacherPressure([], DEFAULT_PERIODS, WEEKDAYS).length, 0);

check(
  "the ceiling is what the staff can carry, not what was asked",
  ceiling(stretched, DEFAULT_PERIODS, WEEKDAYS),
  45,
);
check(
  "and never more than was asked for",
  ceiling([demand({ periodsPerWeek: 3 })], DEFAULT_PERIODS, WEEKDAYS),
  3,
);
check(
  "nor more than the classrooms hold",
  ceiling(
    [demand({ classSectionId: "s1", staffIds: ["a"], periodsPerWeek: 30 }),
     demand({ offeringId: "o2", classSectionId: "s1", staffIds: ["b"], periodsPerWeek: 30 })],
    DEFAULT_PERIODS,
    WEEKDAYS,
  ),
  45,
);

// The generator should get near the ceiling rather than near what was asked.
const stretchedResult = generateTimetable({
  demands: stretched,
  periods: DEFAULT_PERIODS,
  days: WEEKDAYS,
  unavailable: [],
});
const stretchedCeiling = ceiling(stretched, DEFAULT_PERIODS, WEEKDAYS);
ok(
  "an over-subscribed school still gets most of what is possible",
  stretchedResult.placed >= stretchedCeiling * 0.85,
);
ok("and never more than is possible", stretchedResult.placed <= stretchedCeiling);
check(
  "with nothing double booked",
  allClashes(stretchedResult.placements.map((p, i) => ({ ...p, id: String(i) }))).size,
  0,
);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} timetable checks passed.`);
