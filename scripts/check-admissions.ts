/**
 * Where an applicant stands, derived rather than stored.
 *
 *   npm run admissions:check
 *
 * The stage is worth pinning because it is computed from six facts that a
 * registrar changes independently — a mark, an interview, an offer date, an
 * expiry, an acceptance, a place on the waiting list — and the order they are
 * read in decides what the board shows. Getting that order wrong does not
 * error; it just quietly stops showing the school the offers nobody answered.
 */
import {
  actsFor,
  assessmentAverage,
  can,
  stageOf,
  type ApplicationFacts,
} from "../src/lib/admission-rules";

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

const NOW = new Date("2026-03-16T09:00:00Z");
const LAST_WEEK = new Date("2026-03-09T09:00:00Z");
const NEXT_WEEK = new Date("2026-03-23T09:00:00Z");

function facts(over: Partial<ApplicationFacts> = {}): ApplicationFacts {
  return {
    studentStatus: "APPLICANT",
    assessments: [],
    interviews: [],
    offeredOn: null,
    offerExpiresOn: null,
    acceptedOn: null,
    declinedOn: null,
    waitlistRank: null,
    ...over,
  };
}

console.log("\nWhere an applicant stands\n");

check("nothing done yet", stageOf(facts(), NOW), "APPLIED");
check(
  "a paper marked",
  stageOf(facts({ assessments: [{ score: 62 }] }), NOW),
  "ASSESSED",
);
// A paper set but not marked is not an assessment. The registrar books three
// papers on the day the child applies; that is not progress.
check(
  "papers set but unmarked is still applied",
  stageOf(facts({ assessments: [{ score: null }, { score: null }] }), NOW),
  "APPLIED",
);
check(
  "interviewed",
  stageOf(facts({ assessments: [{ score: 62 }], interviews: [{ decision: "RECOMMEND" }] }), NOW),
  "INTERVIEWED",
);
check(
  "on the waiting list",
  stageOf(facts({ interviews: [{ decision: "RESERVE" }], waitlistRank: 3 }), NOW),
  "WAITLISTED",
);

console.log("\nOffers\n");

check(
  "offered, in date",
  stageOf(facts({ offeredOn: LAST_WEEK, offerExpiresOn: NEXT_WEEK }), NOW),
  "OFFERED",
);
// The one the board exists to surface: a place still being held for a family
// who stopped answering the telephone.
check(
  "offered, lapsed",
  stageOf(facts({ offeredOn: LAST_WEEK, offerExpiresOn: LAST_WEEK }), NOW),
  "EXPIRED",
);
check(
  "an offer with no expiry never lapses",
  stageOf(facts({ offeredOn: LAST_WEEK, offerExpiresOn: null }), NOW),
  "OFFERED",
);
check(
  "accepted beats the expiry",
  stageOf(
    facts({ offeredOn: LAST_WEEK, offerExpiresOn: LAST_WEEK, acceptedOn: NOW }),
    NOW,
  ),
  "ACCEPTED",
);
check(
  "declined beats accepted",
  stageOf(facts({ offeredOn: LAST_WEEK, acceptedOn: LAST_WEEK, declinedOn: NOW }), NOW),
  "DECLINED",
);
// A lapsed offer is reported ahead of the interview that produced it, because
// the lapsed offer is the thing somebody has to act on.
check(
  "a lapsed offer outranks the interview behind it",
  stageOf(
    facts({
      interviews: [{ decision: "RECOMMEND" }],
      offeredOn: LAST_WEEK,
      offerExpiresOn: LAST_WEEK,
    }),
    NOW,
  ),
  "EXPIRED",
);

console.log("\nThe student record wins\n");

check(
  "enrolled is enrolled whatever else is on the record",
  stageOf(facts({ studentStatus: "ENROLLED", offeredOn: LAST_WEEK, declinedOn: NOW }), NOW),
  "ENROLLED",
);
check(
  "withdrawn",
  stageOf(facts({ studentStatus: "WITHDRAWN", offeredOn: LAST_WEEK }), NOW),
  "WITHDRAWN",
);
check(
  "transferred out counts as withdrawn",
  stageOf(facts({ studentStatus: "TRANSFERRED_OUT" }), NOW),
  "WITHDRAWN",
);

console.log("\nWhat may be done next\n");

check("a fresh application can be offered", can("APPLIED", "OFFER"), true);
// The gate on the intake: nothing jumps from a web form to the class roll.
check("a fresh application cannot be enrolled", can("APPLIED", "ENROL"), false);
check("an offer cannot be enrolled before it is accepted", can("OFFERED", "ENROL"), false);
check("an accepted place can be enrolled", can("ACCEPTED", "ENROL"), true);
// Ringing the family is the ordinary outcome of a lapsed offer, and they
// usually say yes.
check("a lapsed offer can still be accepted", can("EXPIRED", "ACCEPT"), true);
check("a lapsed offer can be re-offered with a new date", can("EXPIRED", "OFFER"), true);
check("an enrolled child is out of the pipeline", actsFor("ENROLLED"), []);
check("a declined application is closed", actsFor("DECLINED"), []);
check("a withdrawn one too", actsFor("WITHDRAWN"), []);
// A family that accepts and then changes its mind in August is common.
check("an accepted place can still be declined", can("ACCEPTED", "DECLINE"), true);

console.log("\nEntrance papers\n");

check(
  "two papers averaged",
  assessmentAverage([
    { score: 80, maxScore: 100 },
    { score: 60, maxScore: 100 },
  ]),
  70,
);
check(
  "a paper out of something else",
  assessmentAverage([{ score: 30, maxScore: 40 }]),
  75,
);
// An unmarked paper is not a zero — the same rule the report card follows.
check(
  "an unmarked paper is skipped, not scored nothing",
  assessmentAverage([
    { score: 80, maxScore: 100 },
    { score: null, maxScore: 100 },
  ]),
  80,
);
check("nothing marked has no average", assessmentAverage([{ score: null, maxScore: 100 }]), null);
check("no papers at all", assessmentAverage([]), null);
check(
  "a paper out of zero cannot divide by it",
  assessmentAverage([{ score: 10, maxScore: 0 }, { score: 50, maxScore: 100 }]),
  50,
);
check("a zero is a zero, not a missing mark", assessmentAverage([{ score: 0, maxScore: 100 }]), 0);

console.log(
  failures ? `\n  ${failures} FAILURE(S)\n` : "\n  Every case behaves as written.\n",
);
process.exit(failures ? 1 : 0);
