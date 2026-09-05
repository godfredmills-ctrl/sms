/**
 * Tests for the board report.
 *
 * The arithmetic here is simple and the ways it goes wrong are not. Every one
 * of these has a version that produces a plausible sentence in a document that
 * will be read aloud in a meeting and minuted.
 *
 * A percentage against a baseline of nothing. A collection rate for a term
 * nobody has invoiced. Four weeks of this term set against a whole one and
 * reported as a decline. A figure the school cannot produce, printed as zero.
 */

import {
  SECTION_ORDER,
  budgetUse,
  change,
  collectionRate,
  comparable,
  completeness,
  figure,
  gapLabel,
  gaps,
  orderSections,
  printable,
  rateOf,
  unavailable,
  withChange,
  type Section,
} from "../src/lib/board-report-rules";

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
// A figure
// -----------------------------------------------------------------------------

const attendance = figure("Attendance", "94.2%", "Of sessions marked, second term.");
check("a stated figure has a value", attendance.value, "94.2%");
check("and a basis", attendance.basis, "Of sessions marked, second term.");
check("and nothing missing", attendance.missing, null);
check("and no comparison unless one is given", attendance.change, null);

// The rule this module mostly exists for. Zero is a fact; a blank is an
// absence; printing one for the other tells a board the school spent nothing
// on repairs when what happened is that nobody recorded any.
const gap = unavailable("Repairs", "No expenditure has been recorded against this category.");
check("an unavailable figure has no value", gap.value, null);
check("and says why", gap.missing, "No expenditure has been recorded against this category.");
ok("and is not a zero", gap.value !== "0" && gap.value !== "0%");

// -----------------------------------------------------------------------------
// Comparisons
// -----------------------------------------------------------------------------

check("no baseline, no comparison", change(120, null), null);
check("unchanged is said, not computed to nothing", change(120, 120)?.wording, "unchanged");
check("and has no direction either way", change(120, 120)?.direction, "level");

check("a rise", change(140, 100)?.wording, "up 40%");
check("a fall", change(60, 100)?.wording, "down 40%");
check("the raw difference travels too", change(140, 100)?.delta, 40);
check("and is negative on a fall", change(60, 100)?.delta, -40);

// The two that put nonsense in a board paper.
//
// A baseline of nothing is infinity, and it is how a document comes to say
// "up Infinity%" in front of a governing board.
check("up from nothing is words, not a percentage", change(1400, 0)?.wording, "up from nothing");
check("and has a direction", change(1400, 0)?.direction, "up");
check("down from nothing cannot really happen but is worded anyway", change(-5, 0)?.wording, "down from nothing");

// A small baseline makes a true percentage that reads as drama: three cover
// periods becoming nine is "up 200%", which is a sentence about arithmetic
// rather than about the school.
check("a small baseline gets the plain difference", change(9, 3)?.wording, "up 6");
check("and so does a small fall", change(3, 9)?.wording, "down 6");
check("nineteen is still small", change(30, 19)?.wording, "up 11");
check("twenty is not", change(30, 20)?.wording, "up 50%");

// A negative baseline is a deficit, and the sign must not flip the wording.
check("a deficit deepening", change(-300, -100)?.direction, "down");
check("and its size is the distance", change(-300, -100)?.wording, "down 200%");

/*
 * Points, not per cent.
 *
 * Attendance of 94 against 91 is up three POINTS. Worded as three per cent it
 * is the confusion that lives in board papers everywhere, and it is always
 * read as the smaller number: a governing board told attendance is "up 3%"
 * hears a third of what actually happened.
 */
check("a rate rises in points", change(94, 91, "points")?.wording, "up 3 points");
check("and falls in them", change(91, 94, "points")?.wording, "down 3 points");
check("one point is singular", change(92, 91, "points")?.wording, "up 1 point");
check("a fraction of a point survives", change(94.2, 91.0, "points")?.wording, "up 3.2 points");
check("the same numbers as counts read quite differently", change(94, 91)?.wording, "up 3%");
check("a rate that did not move", change(94, 94, "points")?.wording, "unchanged");

// A rate from nothing is still points: "up from nothing" would be true of a
// count and is nonsense about a percentage that was zero.
check("a rate up from zero is points", change(94, 0, "points")?.wording, "up 94 points");

check("attaching a comparison", withChange(attendance, change(94, 91, "points"))?.change?.wording, "up 3 points");
check("and attaching none leaves it null", withChange(attendance, null).change, null);

// -----------------------------------------------------------------------------
// Whether a comparison is fair at all
// -----------------------------------------------------------------------------

ok("no baseline period is not comparable", !comparable({ days: 60 }, null));
ok("two equal terms are", comparable({ days: 60 }, { days: 60 }));
ok("a tenth shorter is", comparable({ days: 56 }, { days: 60 }));
ok("a tenth longer is", comparable({ days: 65 }, { days: 60 }));

// The one that matters: four weeks against a whole term is not a decline in
// anything, and the arithmetic saying so will be believed.
ok("a term four weeks in is not comparable to a whole one", !comparable({ days: 20 }, { days: 60 }));
ok("nor a whole one to four weeks", !comparable({ days: 60 }, { days: 20 }));
ok("a period of no days is not comparable", !comparable({ days: 0 }, { days: 60 }));
ok("nor against one", !comparable({ days: 60 }, { days: 0 }));
ok("negatives are refused rather than trusted", !comparable({ days: -60 }, { days: -60 }));

// -----------------------------------------------------------------------------
// Money
// -----------------------------------------------------------------------------

check("a collection rate", collectionRate(1_000_000, 820_000), 82);
check("to one decimal", collectionRate(1_000_000, 826_400), 82.6);
check("everything collected", collectionRate(500_000, 500_000), 100);
check("nothing collected is nought, not nothing", collectionRate(500_000, 0), 0);

// A term nobody has invoiced has not collected 0% of it, and a red zero on a
// board paper starts a conversation about the wrong thing.
check("nothing billed has no rate", collectionRate(0, 0), null);
check("nor does a negative billed", collectionRate(-100, 0), null);

// Overpayment is real: families pay a term ahead.
check("more collected than billed is over a hundred", collectionRate(100_000, 120_000), 120);

const budget = budgetUse(1_000_000, 400_000, 150_000);
check("used counts both", budget.usedMinor, 550_000);
check("left is the rest", budget.leftMinor, 450_000);
check("and the proportion", budget.percent, 55);

// A line nobody budgeted is unmeasured, which is not the same as fully spent.
const noBudget = budgetUse(null, 400_000, 0);
check("no budget still knows what was used", noBudget.usedMinor, 400_000);
check("but has nothing left to state", noBudget.leftMinor, null);
check("and no proportion", noBudget.percent, null);
check("a budget of nothing is treated the same", budgetUse(0, 10, 0).percent, null);

check("over budget goes negative rather than clamping", budgetUse(100_000, 150_000, 0).leftMinor, -50_000);
check("and over a hundred per cent", budgetUse(100_000, 150_000, 0).percent, 150);

check("a rate", rateOf(3, 4), 75);
check("of nothing", rateOf(0, 4), 0);
check("over nothing", rateOf(3, 0), null);
check("over a negative", rateOf(3, -4), null);

// -----------------------------------------------------------------------------
// The document
// -----------------------------------------------------------------------------

const section = (key: string, title: string, figures: Section["figures"]): Section => ({
  key,
  title,
  blurb: "",
  figures,
});

const sections: Section[] = [
  section("money", "Money", [
    figure("Billed", "GHS 1,000,000", "Invoices raised this term."),
    unavailable("Repairs", "No expenditure has been recorded against this category."),
  ]),
  section("enrolment", "Enrolment", [figure("On roll", "412", "Enrolled at the end of term.")]),
  section("attendance", "Attendance", [figure("Rate", "94.2%", "Of sessions marked.")]),
];

// Children first, because a paper that opens on money teaches a board to read
// the school as a business with pupils in it.
check(
  "the order is the order a meeting runs in",
  orderSections(sections).map((entry) => entry.key),
  ["enrolment", "attendance", "money"],
);
check("SECTION_ORDER leads with enrolment", SECTION_ORDER[0], "enrolment");
check("and money is not first", SECTION_ORDER.indexOf("money") > 0, true);

// A section the assembler produced nothing for is not printed as an empty
// heading with silence under it.
check(
  "empty sections are not printed",
  printable([...sections, section("boarding", "Boarding", [])]).map((entry) => entry.key),
  ["enrolment", "attendance", "money"],
);
check("and printing preserves the order", printable(sections)[0]?.key, "enrolment");

const state = completeness(sections);
check("every figure is counted", state.figures, 4);
check("stated ones", state.stated, 3);
check("and the gaps", state.missing, 1);
ok("the wording names both", state.wording.includes("3 stated") && state.wording.includes("1 the school cannot"));

const whole = completeness([section("enrolment", "Enrolment", [figure("On roll", "412", "x")])]);
ok("a complete report says so", whole.wording.includes("every one of them stated"));
check("nothing at all is said plainly", completeness([]).wording, "There is nothing in this report.");
check("and counts nothing", completeness([]).figures, 0);

const holes = gaps(sections);
check("one gap", holes.length, 1);
check("it names its section", holes[0]?.section, "Money");
check("and the figure", holes[0]?.label, "Repairs");
check("and why", holes[0]?.why, "No expenditure has been recorded against this category.");
check("a complete report has no gaps", gaps([section("x", "X", [figure("a", "1", "b")])]).length, 0);

// A section with one headline number shares its name with that number, and
// naming it twice is a stutter in a document read aloud in a meeting.
check("a gap names its section and figure", gapLabel({ section: "Money", label: "Repairs" }), "Money, Repairs");
check("unless they are the same", gapLabel({ section: "Attendance", label: "Attendance" }), "Attendance");

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    x ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} board report checks passed.`);
