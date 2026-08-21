/**
 * The subject-mark arithmetic, and the difference between the three ways a
 * component can have no number in it.
 *
 *   npm run marks:check
 *
 * This is worth a file of its own because it decides what a school sends home.
 * An absence counted as a zero does not only hurt the pupil who was ill: the
 * class average and every position on the sheet are computed from these
 * totals, so one zero moves everybody. And it is invisible — the card prints a
 * number, and the number is wrong in a way nobody can see by looking at it.
 */
import { formatScoreCell, weightSubject, type Component } from "../src/lib/marks-math";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}`);
    console.log(`         expected ${b}`);
    console.log(`         actual   ${a}`);
  }
}

/** A component, with the boring fields filled in. */
function part(input: Partial<Component> & { weight: number }): Component {
  return {
    maxScore: 100,
    isExam: false,
    score: null,
    isAbsent: false,
    isExempt: false,
    ...input,
  };
}

console.log("\nWeighting\n");

// The ordinary case: 30% CA at 80, 70% exam at 60.
{
  const result = weightSubject([
    part({ weight: 30, score: 80 }),
    part({ weight: 70, score: 60, isExam: true }),
  ]);
  check("CA sub-total", result.caScore, 24);
  check("exam sub-total", result.examScore, 42);
  check("subject total", result.totalScore, 66);
  check("nothing is marked absent", [result.caAbsent, result.examAbsent], [false, false]);
}

// Marked out of something other than 100.
{
  const result = weightSubject([part({ weight: 100, score: 25, maxScore: 50 })]);
  check("a paper out of 50", result.totalScore, 50);
}

console.log("\nAbsence is not a zero\n");

// The bug this file exists for. A pupil present for the CA and ill for the
// exam has a CA mark, not a CA mark halved.
{
  const absent = weightSubject([
    part({ weight: 30, score: 80 }),
    part({ weight: 70, isAbsent: true, isExam: true }),
  ]);
  check("the total is the CA alone, renormalised", absent.totalScore, 80);
  check("the exam sub-total is not a number", absent.examScore, null);
  check("the exam weight was not spent", absent.examWeight, 0);
  check("and it says the exam was an absence", absent.examAbsent, true);

  // What the old formula did, for the record: 0 for the exam, full weight
  // charged, 80 × 0.3 = 24 out of 100.
  const asZero = weightSubject([
    part({ weight: 30, score: 80 }),
    part({ weight: 70, score: 0, isExam: true }),
  ]);
  check("a genuine zero still scores 24", asZero.totalScore, 24);
  check("a zero is not an absence", asZero.examAbsent, false);
  check(
    "the difference between them is 56 marks",
    round(absent.totalScore! - asZero.totalScore!),
    56,
  );
}

// Absent for everything: no total at all, rather than a zero.
{
  const result = weightSubject([
    part({ weight: 30, isAbsent: true }),
    part({ weight: 70, isAbsent: true, isExam: true }),
  ]);
  check("absent throughout has no total", result.totalScore, null);
  check("both halves say absent", [result.caAbsent, result.examAbsent], [true, true]);
}

// One of two exam papers sat: the one sat carries the subject.
{
  const result = weightSubject([
    part({ weight: 35, score: 70, isExam: true }),
    part({ weight: 35, isAbsent: true, isExam: true }),
    part({ weight: 30, score: 90 }),
  ]);
  check("the sat paper is not diluted by the missed one", result.totalScore, 79.2);
  check("some exam weight was used, so it is not an absence", result.examAbsent, false);
}

console.log("\nUnmarked is not a zero either\n");

// Mid-term, with the exam still to be marked. Every pupil must not appear to
// be failing until the last script is entered.
{
  const result = weightSubject([
    part({ weight: 30, score: 75 }),
    part({ weight: 70, score: null, isExam: true }),
  ]);
  check("an unmarked exam leaves a CA-only total", result.totalScore, 75);
  check("and is not reported as an absence", result.examAbsent, false);
}

// Nothing marked at all.
{
  const result = weightSubject([part({ weight: 100, score: null, isExam: true })]);
  check("nothing marked gives no total", result.totalScore, null);
}

console.log("\nExempt\n");

// Exempt is silent: out of the sum, and not remarked on. It means "was never
// expected to sit this", which is a different thing from not turning up.
{
  const result = weightSubject([
    part({ weight: 30, score: 60 }),
    part({ weight: 70, isExempt: true, isAbsent: true, isExam: true }),
  ]);
  check("exempt is excluded", result.totalScore, 60);
  check("exempt is not reported as an absence", result.examAbsent, false);
}

console.log("\nEdges\n");

check("no components at all", weightSubject([]).totalScore, null);
check(
  "a zero-weight component is ignored",
  weightSubject([part({ weight: 0, score: 100 }), part({ weight: 50, score: 40 })])
    .totalScore,
  40,
);
check(
  "a component marked out of zero does not divide by zero",
  weightSubject([part({ weight: 50, score: 10, maxScore: 0 })]).totalScore,
  0,
);
check(
  "weights that do not add to 100 still renormalise",
  weightSubject([
    part({ weight: 20, score: 50 }),
    part({ weight: 20, score: 100, isExam: true }),
  ]).totalScore,
  75,
);
check(
  "a mark above its maximum is not clamped here",
  weightSubject([part({ weight: 100, score: 110 })]).totalScore,
  110,
);

console.log("\nWhat a cell prints\n");

check("a mark prints as a number", formatScoreCell(45), "45.0");
check("a zero prints as a zero", formatScoreCell(0), "0.0");
check("an absence prints Abs", formatScoreCell(null, { absent: true }), "Abs");
check("no component prints a dash", formatScoreCell(null), "—");
check("undefined prints a dash", formatScoreCell(undefined), "—");
check("decimals can be asked for", formatScoreCell(45.678, { decimals: 2 }), "45.68");

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

console.log(
  failures ? `\n  ${failures} FAILURE(S)\n` : "\n  Every case behaves as written.\n",
);
process.exit(failures ? 1 : 0);
