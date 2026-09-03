/**
 * Tests for lesson note arithmetic.
 *
 * Most of it is the week counting, because that is where this goes wrong
 * quietly. A term beginning on a Wednesday, a note written during the
 * holidays, a school that corrects its term dates in week three: each of them
 * produces a plausible number that files a note under a week nobody looks at,
 * and nothing errors.
 *
 * The rest is the transition table, which the screen and the action both read.
 * A button the action refuses is the failure this table exists to prevent.
 */

import {
  SECTIONS,
  STATUSES,
  allowedTransitions,
  canTransition,
  compliance,
  completeness,
  editable,
  emptySections,
  missingSections,
  mondayOf,
  readyToSubmit,
  reflectionEditable,
  statusLabel,
  statusTone,
  termWeeks,
  timeliness,
  weekEndingFor,
  weekOfTerm,
  weeksInTerm,
} from "../src/lib/lesson-notes";

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

const on = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// -----------------------------------------------------------------------------
// Weeks
// -----------------------------------------------------------------------------

// 2026-09-14 is a Monday.
check("a Monday is its own Monday", iso(mondayOf(on("2026-09-14"))), "2026-09-14");
check("a Wednesday goes back two days", iso(mondayOf(on("2026-09-16"))), "2026-09-14");
check("a Friday goes back four", iso(mondayOf(on("2026-09-18"))), "2026-09-14");
check("a Sunday belongs to the week it ends", iso(mondayOf(on("2026-09-20"))), "2026-09-14");
check("a Saturday too", iso(mondayOf(on("2026-09-19"))), "2026-09-14");

// A term that begins on a Monday.
const tidy = { startDate: on("2026-09-14"), endDate: on("2026-12-18") };

check("the first Monday is week 1", weekOfTerm(on("2026-09-14"), tidy), 1);
check("so is the Friday of that week", weekOfTerm(on("2026-09-18"), tidy), 1);
check("the next Monday is week 2", weekOfTerm(on("2026-09-21"), tidy), 2);
check("and a month in is week 5", weekOfTerm(on("2026-10-12"), tidy), 5);

/*
 * A term that begins on a Wednesday, which is the case that goes wrong.
 *
 * Counting from the start date rather than from that week's Monday makes week
 * 1 run into the following Tuesday, and puts every week after it three days
 * out. The school still calls the Friday two days after term opens the end of
 * week 1, and that is what the note is headed by.
 */
const awkward = { startDate: on("2026-09-16"), endDate: on("2026-12-18") };

check("term opening on a Wednesday is still week 1", weekOfTerm(on("2026-09-16"), awkward), 1);
check("and the Friday of that week is week 1", weekOfTerm(on("2026-09-18"), awkward), 1);
check("the following Monday is week 2", weekOfTerm(on("2026-09-21"), awkward), 2);
check("and not week 1 running on", weekOfTerm(on("2026-09-22"), awkward), 2);

check("before term is week 1, not zero", weekOfTerm(on("2026-08-01"), tidy), 1);
check("nor negative", weekOfTerm(on("2026-01-01"), tidy), 1);
check("after term is the last week", weekOfTerm(on("2027-02-01"), tidy), weeksInTerm(tidy));

check("a fourteen week term", weeksInTerm(tidy), 14);
check("a one week term is one week", weeksInTerm({ startDate: on("2026-09-14"), endDate: on("2026-09-18") }), 1);
check(
  "a term ending the day it starts is still a week",
  weeksInTerm({ startDate: on("2026-09-16"), endDate: on("2026-09-16") }),
  1,
);

check("week 1 ends on the Friday", iso(weekEndingFor(1, tidy)), "2026-09-18");
check("week 2 the Friday after", iso(weekEndingFor(2, tidy)), "2026-09-25");
check("week 14 at the end of term", iso(weekEndingFor(14, tidy)), "2026-12-18");
check(
  "a Wednesday start still ends week 1 on that Friday",
  iso(weekEndingFor(1, awkward)),
  "2026-09-18",
);

const weeks = termWeeks(tidy);
check("every week of term is offered", weeks.length, 14);
check("numbered from one", weeks[0].weekNumber, 1);
check("to the last", weeks[13].weekNumber, 14);
ok(
  "each ending on a Friday",
  weeks.every((week) => week.weekEnding.getDay() === 5),
);

// The round trip, which is the property that matters: the week a Friday falls
// in is the week that Friday ends.
ok(
  "every week ending reads back as its own week",
  weeks.every((week) => weekOfTerm(week.weekEnding, tidy) === week.weekNumber),
);

// -----------------------------------------------------------------------------
// What a note needs
// -----------------------------------------------------------------------------

const complete = {
  topic: "Photosynthesis",
  subTopic: "The role of chlorophyll",
  objectives: ["State what a plant needs to make food"],
  rpk: "Pupils know that plants are living things.",
  materials: ["Green leaves", "Iodine solution"],
  coreCompetencies: ["Critical thinking"],
  introduction: "Ask what a plant eats.",
  development: "Demonstrate the starch test.",
  closure: "Recap the word equation.",
  evaluation: "Five questions on the board.",
  homework: "Draw a labelled leaf.",
  reflection: null,
};

check("a complete note is missing nothing", missingSections(complete), []);
ok("and is ready to submit", readyToSubmit(complete));
check("the reflection is still empty", emptySections(complete), ["Reflection"]);
check("which is eleven of twelve", completeness(complete), 92);

const bare = { topic: "Photosynthesis" };
check(
  "an empty note names every required section",
  missingSections(bare),
  [
    "Objectives",
    "Relevant previous knowledge",
    "Teaching and learning materials",
    "Introduction",
    "Development",
    "Closure",
    "Evaluation",
  ],
);
ok("and is not ready", !readyToSubmit(bare));
check("one of twelve", completeness(bare), 8);
check("nothing at all is nothing done", completeness({}), 0);

// Whitespace is not an answer.
check("a topic of spaces is no topic", missingSections({ ...complete, topic: "   " }), ["Topic"]);
check(
  "an objectives list of empty strings is no objectives",
  missingSections({ ...complete, objectives: ["", "  "] }),
  ["Objectives"],
);
check("an empty list is no list", missingSections({ ...complete, materials: [] }), [
  "Teaching and learning materials",
]);
check(
  "one real entry among blanks is enough",
  missingSections({ ...complete, objectives: ["", "State the word equation"] }),
  [],
);

// The two the form does not insist on before teaching.
check("homework is not required", missingSections({ ...complete, homework: null }), []);
check("nor the reflection", missingSections({ ...complete, reflection: null }), []);
check("nor a sub-topic", missingSections({ ...complete, subTopic: null }), []);
check("nor core competencies", missingSections({ ...complete, coreCompetencies: [] }), []);

ok("every section key is distinct", new Set(SECTIONS.map((s) => s.key)).size === SECTIONS.length);
// Topic, objectives, RPK, materials, and the four phases of the lesson.
check("eight sections are required", SECTIONS.filter((s) => s.required).length, 8);

// -----------------------------------------------------------------------------
// Status and who may move it
// -----------------------------------------------------------------------------

check("a draft is named", statusLabel("DRAFT"), "Draft");
check("an unknown status names itself", statusLabel("LOST"), "LOST");
check("approved is a success", statusTone("APPROVED"), "success");
check("returned is a warning", statusTone("RETURNED"), "warning");
ok("every status is distinct", new Set(STATUSES.map((s) => s.value)).size === STATUSES.length);

ok("a teacher submits a draft", canTransition("DRAFT", "SUBMITTED", "teacher"));
ok("and submits a returned note again", canTransition("RETURNED", "SUBMITTED", "teacher"));
ok("a teacher cannot approve their own note", !canTransition("SUBMITTED", "APPROVED", "teacher"));
ok("nor send it back to themselves", !canTransition("SUBMITTED", "RETURNED", "teacher"));
ok("nor un-submit it", !canTransition("SUBMITTED", "DRAFT", "teacher"));

ok("a vetter approves a submitted note", canTransition("SUBMITTED", "APPROVED", "vetter"));
ok("and sends one back", canTransition("SUBMITTED", "RETURNED", "vetter"));
ok("and can reopen one approved by mistake", canTransition("APPROVED", "SUBMITTED", "vetter"));
ok("a vetter cannot approve a draft", !canTransition("DRAFT", "APPROVED", "vetter"));
ok("nor submit on the teacher's behalf", !canTransition("DRAFT", "SUBMITTED", "vetter"));

check(
  "a draft offers the teacher one move",
  allowedTransitions("DRAFT", "teacher").map((t) => t.to),
  ["SUBMITTED"],
);
check("and the vetter none", allowedTransitions("DRAFT", "vetter"), []);
check(
  "a submitted note offers the vetter two",
  allowedTransitions("SUBMITTED", "vetter").map((t) => t.to),
  ["APPROVED", "RETURNED"],
);
check("and the teacher none", allowedTransitions("SUBMITTED", "teacher"), []);

ok("a draft can be edited", editable("DRAFT"));
ok("so can a returned note", editable("RETURNED"));
ok("a submitted note cannot", !editable("SUBMITTED"));
ok("nor an approved one", !editable("APPROVED"));

// The reflection is written after the teaching, so approval does not close it.
ok("the reflection stays open on an approved note", reflectionEditable("APPROVED"));
ok("and on a draft", reflectionEditable("DRAFT"));
ok("but not while it is being vetted", !reflectionEditable("SUBMITTED"));

// -----------------------------------------------------------------------------
// Being on time
// -----------------------------------------------------------------------------

// Week ending Friday 2026-09-18; the week starts Monday 2026-09-14.
const week = on("2026-09-18");
const NOW = on("2026-10-01");

const at = (status: string, submitted: string | null) => ({
  status,
  submittedAt: submitted ? on(submitted) : null,
  weekEnding: week,
});

check("a draft has not been submitted", timeliness(at("DRAFT", null), NOW), "notSubmitted");
check(
  "and a draft with a date is still not submitted",
  timeliness(at("DRAFT", "2026-09-10"), NOW),
  "notSubmitted",
);
check("the Friday before is early", timeliness(at("SUBMITTED", "2026-09-11"), NOW), "early");
check("the Sunday before is early", timeliness(at("SUBMITTED", "2026-09-13"), NOW), "early");
check("the Monday itself is on time", timeliness(at("SUBMITTED", "2026-09-14"), NOW), "onTime");
check("the Tuesday is late", timeliness(at("SUBMITTED", "2026-09-15"), NOW), "late");
check("and the Friday of the week is late", timeliness(at("SUBMITTED", "2026-09-18"), NOW), "late");
check("an approved note keeps its timeliness", timeliness(at("APPROVED", "2026-09-11"), NOW), "early");

// -----------------------------------------------------------------------------
// Compliance
// -----------------------------------------------------------------------------

const notes = [
  at("APPROVED", "2026-09-11"),
  at("APPROVED", "2026-09-22"),
  at("SUBMITTED", "2026-09-29"),
  at("RETURNED", "2026-09-29"),
  at("DRAFT", null),
];

const summary = compliance(notes, 6, NOW);
check("six weeks have happened", summary.expected, 6);
check("five notes written", summary.written, 5);
check("two approved", summary.approved, 2);
check("one waiting", summary.submitted, 1);
check("one sent back", summary.returned, 1);
check("four handed in, so two weeks missing", summary.missing, 2);

/*
 * The count that would flatter or insult.
 *
 * A draft is not a note the head has seen, so it does not count towards the
 * weeks covered. Counting it would let a teacher clear their compliance figure
 * by opening a form and never submitting it.
 */
check(
  "a draft does not cover its week",
  compliance([at("DRAFT", null)], 1, NOW).missing,
  1,
);
check(
  "and a submitted one does",
  compliance([at("SUBMITTED", "2026-09-14")], 1, NOW).missing,
  0,
);

check("nothing expected is nothing missing", compliance([], 0, NOW).missing, 0);
check("no notes and six weeks is six missing", compliance([], 6, NOW).missing, 6);
check("more notes than weeks is not negative", compliance(notes, 1, NOW).missing, 0);
check("a negative expectation is treated as none", compliance([], -3, NOW).expected, 0);

check(
  "late notes are counted",
  compliance([at("SUBMITTED", "2026-09-17"), at("APPROVED", "2026-09-11")], 2, NOW).late,
  1,
);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} lesson note checks passed.`);
