/**
 * Tests for appraisal rules.
 *
 * Two things here matter more than the arithmetic.
 *
 * The overall does not exist until every heading is rated. Half an appraisal
 * averaged looks exactly like a whole one, and the half that is missing is
 * reliably the half somebody was avoiding.
 *
 * Only the appraisee agrees or disagrees. An appraiser who can tick "agreed"
 * on somebody else's behalf has produced a document with one signature and two
 * names on it, and nothing about the screen would say so.
 */

import {
  CRITERIA,
  RATINGS,
  STATUSES,
  TRANSITIONS,
  allowedTransitions,
  appraiserEditable,
  bandFor,
  canTransition,
  criterionLabel,
  evidence,
  isRating,
  overall,
  ratingLabel,
  ratingTone,
  refusal,
  selfEditable,
  settled,
  statusHint,
  statusLabel,
  statusTone,
  targetProblem,
  unrated,
  type Facts,
  type Role,
  type Score,
} from "../src/lib/appraisal-rules";

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

/** Every heading at one rating, which is the shape most tests want. */
const allAt = (rating: number): Score[] =>
  CRITERIA.map((criterion) => ({ criterion: criterion.key, rating }));

// -----------------------------------------------------------------------------
// The headings and the scale
// -----------------------------------------------------------------------------

check("eight headings", CRITERIA.length, 8);
check("each has a label", CRITERIA.every((c) => c.label), true);
check("each has a hint", CRITERIA.every((c) => c.hint), true);
check("keys are unique", new Set(CRITERIA.map((c) => c.key)).size, 8);
check("a known heading", criterionLabel("delivery"), "Teaching and delivery");
check("an unknown one is shown as itself", criterionLabel("mystery"), "mystery");

// Four points and no middle: an odd scale collects a whole staff room in the
// centre, which is a way of writing an appraisal without making a judgement.
check("four points", RATINGS.length, 4);
check("and no middle to hide in", RATINGS.length % 2, 0);
check("the top", ratingLabel(4), "Outstanding");
check("the bottom", ratingLabel(1), "Needs attention");
check("nothing rated", ratingLabel(null), "Not rated");
check("nothing rated has no tone", ratingTone(null), "neutral");
check("the bottom reads badly", ratingTone(1), "danger");
check("an unknown value is shown as itself", ratingLabel(9), "9");

ok("4 is a rating", isRating(4));
ok("1 is a rating", isRating(1));
ok("0 is not", !isRating(0));
ok("5 is not", !isRating(5));
ok("half marks are not", !isRating(3.5));
ok("null is not", !isRating(null));
ok("a string is not", !isRating("3"));

// -----------------------------------------------------------------------------
// The overall
// -----------------------------------------------------------------------------

check("nothing rated", overall([]).rated, 0);
check("and no average", overall([]).average, null);
check("and no band", overall([]).band, null);
ok("and not complete", !overall([]).complete);

const partial = allAt(4).slice(0, 5);
check("five of eight", overall(partial).rated, 5);

// The one that matters. Five fours is an average of four, and printing it
// would put "Outstanding" on an appraisal three headings short.
check("a partial appraisal has no average", overall(partial).average, null);
check("nor a band", overall(partial).band, null);
ok("nor is it complete", !overall(partial).complete);

check("all eight rated", overall(allAt(3)).rated, 8);
ok("is complete", overall(allAt(3)).complete);
check("and averages", overall(allAt(3)).average, 3);
check("and bands", overall(allAt(3)).band, "Good");
check("all fours", overall(allAt(4)).average, 4);
check("all ones", overall(allAt(1)).average, 1);
check("all ones band", overall(allAt(1)).band, "Needs attention");

// A rating outside the scale is not a rating, so it does not complete the set.
const withRubbish = [...allAt(3).slice(0, 7), { criterion: "contribution", rating: 7 }];
ok("a value off the scale does not count as rated", !overall(withRubbish).complete);
check("and leaves the heading unrated", unrated(withRubbish), ["Beyond the classroom"]);

check("nothing rated leaves everything", unrated([]).length, 8);
check("everything rated leaves nothing", unrated(allAt(2)).length, 0);
check(
  "and names what is left",
  unrated(allAt(3).slice(0, 6)).sort(),
  ["Beyond the classroom", "Professional conduct"],
);

// A mixed set, worked by hand: seven threes and one one is 22/8 = 2.75.
const mixed = [...allAt(3).slice(0, 7), { criterion: "contribution", rating: 1 }];
// 22 over 8 is 2.75, shown to one decimal as 2.8. The band is taken from the
// true mean and not from what is printed, which is the whole of the next test.
check("seven good and one concern", overall(mixed).average, 2.8);
check("which is developing, not good", overall(mixed).band, "Developing");

// The boundary that keeps a scale honest. Seven fours and one three is 3.875,
// which is outstanding; seven fours and one two is 3.75, which is not.
check("seven outstanding and one good", overall([...allAt(4).slice(0, 7), { criterion: "contribution", rating: 3 }]).band, "Outstanding");
check("seven outstanding and one developing", overall([...allAt(4).slice(0, 7), { criterion: "contribution", rating: 2 }]).band, "Good");

check("the band boundaries", [bandFor(4), bandFor(3.8), bandFor(3.79), bandFor(3), bandFor(2.99), bandFor(2), bandFor(1.99), bandFor(1)], [
  "Outstanding",
  "Outstanding",
  "Good",
  "Good",
  "Developing",
  "Developing",
  "Needs attention",
  "Needs attention",
]);

// -----------------------------------------------------------------------------
// The evidence
//
// Facts, worded, and never a score. Nothing in this module maps any of them to
// a rating, and these assertions are what say so out loud.
// -----------------------------------------------------------------------------

const facts: Facts = {
  lessonNotes: { handedIn: 34, expected: 36, late: 3 },
  registers: { taken: 210 },
  coverTaken: 7,
  leave: { days: 4, sick: 2 },
  teachingLoad: 24,
};

const rows = evidence(facts, "Term 2");
check("one row per fact", rows.length, 5);
check("the load leads", rows[0]?.label, "Timetabled teaching");
check("and is worded as periods", rows[0]?.value, "24 periods a week");
check("notes are counted, not scored", rows[1]?.value, "34 of 36 handed in");
ok("and the note says over what", (rows[1]?.note ?? "").includes("Term 2"));
ok("and how many were late", (rows[1]?.note ?? "").includes("3 after the week had started"));

// No percentages anywhere. "94%" invites a grade in a way "34 of 36" does not,
// and the whole design of this module rests on the difference.
ok("no row is a percentage", rows.every((row) => !row.value.includes("%")));

// Registers are a count with nothing under them. How many were due depends on
// things this system does not model, and a guessed denominator beside
// somebody name reads exactly like a measured one.
check("registers are counted, not rated", rows[2]?.value, "210 marked");
ok("and the note says why there is no denominator", (rows[2]?.note ?? "").includes("not held anywhere"));
ok("no row is a rating word", rows.every((row) => !/outstanding|good|developing/i.test(row.value)));

check("no late notes says so", evidence({ ...facts, lessonNotes: { handedIn: 36, expected: 36, late: 0 } }, "Term 2")[1]?.note, "None late. Term 2.");

// A member of staff who does not teach has no lesson notes. A row reading
// "0 of 0" beside a librarian is a fact about the software.
const nonTeaching: Facts = {
  lessonNotes: null,
  registers: null,
  coverTaken: null,
  leave: { days: 2, sick: 0 },
  teachingLoad: null,
};
check("nothing to say is not said", evidence(nonTeaching, "2026/2027").length, 1);
check("and what there is, is said", evidence(nonTeaching, "2026/2027")[0]?.label, "Days away");
check("nothing at all", evidence({ lessonNotes: null, registers: null, coverTaken: null, leave: null, teachingLoad: null }, "x").length, 0);

// Zero is a fact and is shown; null is an absence and is not.
check("no cover taken is still a row", evidence({ ...nonTeaching, coverTaken: 0 }, "Term 2").length, 2);
check("and reads as none", evidence({ ...nonTeaching, coverTaken: 0 }, "Term 2")[0]?.value, "0 periods");

check("one period is singular", evidence({ ...nonTeaching, coverTaken: 1 }, "Term 2")[0]?.value, "1 period");
check("one day is singular", evidence({ ...nonTeaching, leave: { days: 1, sick: 0 } }, "Term 2")[0]?.value, "1 day");

// -----------------------------------------------------------------------------
// Where it has got to
// -----------------------------------------------------------------------------

check("five states", STATUSES.length, 5);
check("each has a hint", STATUSES.every((s) => s.hint), true);
check("agreed reads well", statusTone("AGREED"), "success");
check("not agreed reads badly", statusTone("DISPUTED"), "danger");
check("an unknown state", statusLabel("MYSTERY"), "MYSTERY");
check("an unknown state has no hint", statusHint("MYSTERY"), "");

ok("a draft is the appraisee to write", selfEditable("DRAFT"));
ok("once sent it is not", !selfEditable("SELF_ASSESSED"));
ok("the appraiser may write while it is with them", appraiserEditable("SELF_ASSESSED"));
ok("and after a dispute", appraiserEditable("DISPUTED"));
ok("but not once it is agreed", !appraiserEditable("AGREED"));
ok("agreed is settled", settled("AGREED"));
ok("so is disputed: settled is not the same as happy", settled("DISPUTED"));
ok("appraised is not", !settled("APPRAISED"));

const appraisee: Role[] = ["appraisee"];
const appraiser: Role[] = ["appraiser"];

check(
  "the appraisee starts",
  allowedTransitions("DRAFT", appraisee).map((t) => t.to),
  ["SELF_ASSESSED"],
);

// Somebody who never submits cannot thereby prevent being appraised, which
// would be a way of avoiding one for ever.
check(
  "and the appraiser need not wait",
  allowedTransitions("DRAFT", appraiser).map((t) => t.to),
  ["APPRAISED"],
);
check(
  "the appraiser writes once the self-assessment is in",
  allowedTransitions("SELF_ASSESSED", appraiser).map((t) => t.to),
  ["APPRAISED"],
);
check("and the appraisee cannot write it for them", allowedTransitions("SELF_ASSESSED", appraisee).length, 0);

check(
  "the appraisee signs, either way",
  allowedTransitions("APPRAISED", appraisee).map((t) => t.to).sort(),
  ["AGREED", "DISPUTED"],
);

// The one that makes the signature mean something.
check("the appraiser cannot sign for them", allowedTransitions("APPRAISED", appraiser).length, 0);
ok("nor agree on their behalf", !canTransition("APPRAISED", "AGREED", appraiser));
ok("nor record a dispute for them", !canTransition("APPRAISED", "DISPUTED", appraiser));

check(
  "a dispute goes back for another conversation",
  allowedTransitions("DISPUTED", appraiser).map((t) => t.to),
  ["APPRAISED"],
);
check("nothing follows agreement", allowedTransitions("AGREED", appraisee).length, 0);
check("nor for the appraiser", allowedTransitions("AGREED", appraiser).length, 0);

const known = new Set(STATUSES.map((s) => s.value));
ok("every transition is between real states", TRANSITIONS.every((t) => known.has(t.from) && known.has(t.to)));
ok("and none is a loop", TRANSITIONS.every((t) => t.from !== t.to));

// -----------------------------------------------------------------------------
// Targets
// -----------------------------------------------------------------------------

check("a real target", targetProblem({ description: "Hand in lesson notes by the Friday before." }), null);
check("nothing typed", targetProblem({ description: "  " }), "Say what the target is.");
check("a word", targetProblem({ description: "Improve" }) !== null, true);
check("an essay", targetProblem({ description: "x".repeat(600) }) !== null, true);
check("just under the short bound", targetProblem({ description: "Better." }) !== null, true);
check("at it", targetProblem({ description: "Be early" }), null);

// -----------------------------------------------------------------------------
// Refusals
// -----------------------------------------------------------------------------

const decide = (over: Partial<Parameters<typeof refusal>[0]> = {}) =>
  refusal({
    from: "SELF_ASSESSED",
    to: "APPRAISED",
    roles: appraiser,
    own: false,
    selfAppraisal: false,
    scores: allAt(3),
    targets: [{ description: "Hand in lesson notes by the Friday before." }],
    note: "A steady year, and the JHS 2 results bear it out.",
    ...over,
  });

check("an ordinary appraisal", decide(), null);

// Nobody appraises themselves. Checked before anything else, because every
// other refusal below would be beside the point.
check(
  "nobody appraises themselves",
  decide({ selfAppraisal: true }),
  "An appraisal cannot have the same person on both sides of it. Whoever manages staff sets the appraiser.",
);
check(
  "not even to agree with it",
  decide({ selfAppraisal: true, from: "APPRAISED", to: "AGREED", roles: appraisee, own: true }) !== null,
  true,
);

// Only the appraisee signs, and the refusal says why rather than reciting the
// transition table at somebody.
check(
  "an appraiser cannot agree on their behalf",
  decide({ from: "APPRAISED", to: "AGREED", roles: appraiser, own: false }),
  "Only the person being appraised can agree to it or disagree with it. That is the whole of what the signature means.",
);
check(
  "nor record the dispute for them",
  decide({ from: "APPRAISED", to: "DISPUTED", roles: appraiser, own: false, note: "They are unhappy" }),
  "Only the person being appraised can agree to it or disagree with it. That is the whole of what the signature means.",
);
check(
  "the appraisee may agree",
  decide({ from: "APPRAISED", to: "AGREED", roles: appraisee, own: true, note: "" }),
  null,
);

check(
  "an appraisal with a heading unrated",
  decide({ scores: allAt(3).slice(0, 7) }),
  "Rate every heading first. Still to do: Beyond the classroom.",
);
check(
  "with nothing written",
  decide({ note: "   " }),
  "Write the appraisal. A set of ratings with nothing said about them is not something anybody can act on.",
);
check(
  "with no targets",
  decide({ targets: [] }),
  "Set at least one target. An appraisal that asks for nothing to change is a form, not a conversation.",
);
check("with a target nobody could act on", decide({ targets: [{ description: "Better" }] }) !== null, true);

check(
  "disagreeing without saying why",
  decide({ from: "APPRAISED", to: "DISPUTED", roles: appraisee, own: true, note: "" }),
  "Say what you disagree with. Your words go on the record beside the appraisal, which is the point of being able to disagree at all.",
);
check(
  "disagreeing, with words",
  decide({
    from: "APPRAISED",
    to: "DISPUTED",
    roles: appraisee,
    own: true,
    note: "The cover I took on for two terms is not mentioned anywhere in this.",
  }),
  null,
);

check(
  "a step nobody is allowed",
  decide({ from: "AGREED", to: "APPRAISED", roles: appraiser }) !== null,
  true,
);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    x ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} appraisal checks passed.`);
