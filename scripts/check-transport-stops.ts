/**
 * Tests for reading a bus route out of a typed list.
 *
 * Two of these are the reason the module was rewritten.
 *
 * A time the parser could not read used to be stored as null, and the stop
 * saved anyway. The route then went to print with a blank column, and the
 * first person to notice was a parent standing at a junction at ten past
 * seven. Nothing had errored.
 *
 * And a stop that fell off the list used to be pushed to sequence 999 rather
 * than deleted, if children were assigned to it. That is not a safeguard, it
 * is a hiding place: the children were still assigned to a stop that no longer
 * appeared on the route, at a position nobody scrolls to.
 */

import {
  formatStops,
  parseStops,
  planStops,
  stopRefusal,
  type ExistingStop,
} from "../src/lib/transport-stops";

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
// The happy route, exactly as the screenshot shows it
// -----------------------------------------------------------------------------

const REAL = `Spintex Junction | opposite Total | 06:40 | 15:40
Baatsona | by the traffic light | 06:55 | 15:25
Tema Community 7 | 07:15 | 15:05`;

const real = parseStops(REAL);
check("three stops", real.stops.length, 3);
check("and nothing wrong with them", real.problems, []);
check("the first stop", real.stops[0], {
  line: 1,
  name: "Spintex Junction",
  landmark: "opposite Total",
  pickupTime: "06:40",
  dropoffTime: "15:40",
});
// The line from the screenshot that this module was rewritten over. Read
// literally it means name, landmark, pick-up, so the landmark becomes "07:15"
// and the pick-up becomes 15:05: an hour wrong in the afternoon and blank in
// the morning, silently.
check("a stop written with no landmark still gets its two times", real.stops[2], {
  line: 3,
  name: "Tema Community 7",
  landmark: null,
  pickupTime: "07:15",
  dropoffTime: "15:05",
});

check(
  "a real landmark in three fields is still a landmark",
  parseStops("Madina | by the mosque | 06:30").stops[0].landmark,
  "by the mosque",
);
check(
  "and its one time is the pick-up",
  parseStops("Madina | by the mosque | 06:30").stops[0].pickupTime,
  "06:30",
);
check("two fields where the second is a time is a pick-up, not a landmark", parseStops("Madina | 06:30").stops[0], {
  line: 1,
  name: "Madina",
  landmark: null,
  pickupTime: "06:30",
  dropoffTime: null,
});
check(
  "two fields where the second is not a time is a landmark",
  parseStops("Madina | by the mosque").stops[0].landmark,
  "by the mosque",
);
check(
  "somebody who typed all four fields meant all four",
  parseStops("A | 06:40 | 15:40 | x").stops.length,
  0,
);

check("blank lines are not stops", parseStops("\n\nAccra Mall | | 06:00\n\n").stops.length, 1);
check("and do not shift the numbering of the ones that are", parseStops("\n\nAccra Mall\n").stops[0].line, 3);
check("a stop can be just a name", parseStops("Madina").stops[0], {
  line: 1,
  name: "Madina",
  landmark: null,
  pickupTime: null,
  dropoffTime: null,
});
check("an empty list is an empty list", parseStops("").stops, []);
check("and is not a problem", parseStops("   \n  \n").problems, []);

// -----------------------------------------------------------------------------
// A time it cannot read is refused, never discarded
// -----------------------------------------------------------------------------

const dotted = parseStops("Spintex | opposite Total | 06.40 | 15:40");
check("a full stop instead of a colon is not silently dropped", dotted.stops.length, 0);
check("it is reported", dotted.problems.length, 1);
check("on its line", dotted.problems[0].line, 1);
ok("quoting back what was typed", dotted.problems[0].message.includes("06.40"));
ok("and saying what a time looks like", dotted.problems[0].message.includes("06:40"));

ok("half past twenty-five is not a time", parseStops("A | | 25:30").problems.length === 1);
ok("nor is 06:70", parseStops("A | | 06:70").problems.length === 1);
ok("nor is a word", parseStops("A | | morning").problems.length === 1);
check("but midnight is", parseStops("A | | 00:00").stops[0].pickupTime, "00:00");
check("and so is 23:59", parseStops("A | | 23:59").stops[0].pickupTime, "23:59");
check(
  "an empty time is a stop nobody has timed yet, which is allowed",
  parseStops("A | by the church | | 15:40").stops[0].pickupTime,
  null,
);
ok(
  "a bad drop-off is reported as a drop-off, not as a pick-up",
  parseStops("A | | 06:40 | 15.40").problems[0].message.includes("drop-off"),
);

// A line with a problem contributes no stop. Half-reading it would put a stop
// on the route with the wrong times on it, which is worse than refusing.
check("a bad line yields no stop at all", parseStops("A | | 06.40").stops.length, 0);
check(
  "and the good lines around it still parse",
  parseStops("Good | | 06:40\nBad | | 06.40\nAlso good | | 07:00").stops.length,
  2,
);
check(
  "with the problem pointing at the middle line",
  parseStops("Good | | 06:40\nBad | | 06.40\nAlso good | | 07:00").problems[0].line,
  2,
);

// -----------------------------------------------------------------------------
// Other things people type
// -----------------------------------------------------------------------------

const noName = parseStops(" | opposite Total | 06:40");
check("a line with no name is refused", noName.stops.length, 0);
ok("and says so", noName.problems[0].message.includes("no stop name"));

const tooMany = parseStops("A | b | 06:40 | 15:40 | extra");
check("five parts is refused", tooMany.stops.length, 0);
ok("and explains the shape", tooMany.problems[0].message.includes("name, landmark, pick-up, drop-off"));

const twice = parseStops("Baatsona | | 06:55\nBaatsona | | 07:10");
check("the same stop twice keeps only the first", twice.stops.length, 1);
ok("and reports the second", twice.problems[0].message.includes("already on this route at line 1"));
check(
  "case does not make it a different stop",
  parseStops("Baatsona | | 06:55\nBAATSONA | | 07:10").problems.length,
  1,
);

// -----------------------------------------------------------------------------
// Round trip
// -----------------------------------------------------------------------------

const stops = [
  { name: "Spintex Junction", landmark: "opposite Total", pickupTime: "06:40", dropoffTime: "15:40" },
  { name: "Madina", landmark: null, pickupTime: null, dropoffTime: null },
];
check(
  "formatting drops the trailing bars of a bare stop",
  formatStops(stops),
  "Spintex Junction | opposite Total | 06:40 | 15:40\nMadina",
);
check(
  "and what it writes, it can read back",
  parseStops(formatStops(stops)).stops.map((s) => ({
    name: s.name,
    landmark: s.landmark,
    pickupTime: s.pickupTime,
    dropoffTime: s.dropoffTime,
  })),
  stops,
);
check("formatting nothing is nothing", formatStops([]), "");

// -----------------------------------------------------------------------------
// What a save would do
// -----------------------------------------------------------------------------

const existing: ExistingStop[] = [
  { id: "s1", name: "Spintex Junction", riders: 4 },
  { id: "s2", name: "Baatsona", riders: 2 },
  { id: "s3", name: "Old Depot", riders: 0 },
];

const same = planStops(parseStops(REAL).stops, existing);
check("two known stops are updated", same.update.length, 2);
check("and keep their ids", same.update.map((u) => u.id), ["s1", "s2"]);
check("and are renumbered by their place in the list", same.update.map((u) => u.sequence), [1, 2]);
check("the new one is created", same.create.length, 1);
check("at the end", same.create[0].sequence, 3);
check("the empty stop nobody uses is removed", same.remove, ["s3"]);
check("and nobody is stranded", same.stranded, []);
check("so the save may go ahead", stopRefusal(same), null);

// The case that used to hide children at sequence 999.
const renamed = planStops(parseStops("Spintex Junction | | 06:40\nBaatsona Total | | 06:55").stops, existing);
check("a renamed stop reads as a new stop", renamed.create.length, 1);
check("and the old one as one with children on it", renamed.stranded.length, 1);
check("named", renamed.stranded[0].name, "Baatsona");
ok("it is NOT in the removal list", !renamed.remove.includes("s2"));
const refusal = stopRefusal(renamed);
ok("the save is refused", refusal !== null);
ok("naming the stop", String(refusal).includes("Baatsona"));
ok("and how many children stand there", String(refusal).includes("2 children"));
ok("and saying that a rename looks like a deletion from here", String(refusal).includes("Renaming a stop"));

check(
  "one child reads as a child, not as 1 children",
  String(stopRefusal(planStops([], [{ id: "x", name: "Lone", riders: 1 }]))).includes("1 child)"),
  true,
);

// Clearing the list entirely is the same question, asked louder.
const cleared = planStops([], existing);
check("everything with children on it is stranded", cleared.stranded.length, 2);
check("the empty one is still just removed", cleared.remove, ["s3"]);
ok("and the save is refused", stopRefusal(cleared) !== null);

check(
  "a route with no existing stops creates all of them",
  planStops(parseStops(REAL).stops, []).create.length,
  3,
);
check("and removes nothing", planStops(parseStops(REAL).stops, []).remove, []);
check("and strands nobody", planStops(parseStops(REAL).stops, []).stranded, []);

// Reordering is not renaming: the ids follow their names.
const reordered = planStops(
  parseStops("Baatsona | | 06:55\nSpintex Junction | | 06:40").stops,
  existing.slice(0, 2),
);
check("reordering keeps both ids", reordered.update.map((u) => u.id), ["s2", "s1"]);
check("with the new sequence", reordered.update.map((u) => u.sequence), [1, 2]);
check("creating nothing", reordered.create, []);
check("and stranding nobody", reordered.stranded, []);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    x ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} transport stop checks passed.`);
