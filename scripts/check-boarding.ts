/**
 * The boarding rules: who may sleep where, and what an exeat can become.
 *
 *   npm run boarding:check
 *
 * The exeat transitions are worth pinning because the whole record depends on
 * them being one-way. A leave-out that can be reopened is a leave-out whose
 * "signed back in at 18:40" can be overwritten by the next one, and that
 * timestamp is what the school has when somebody asks where a child was.
 */
import {
  EVERY_HOUSE,
  EXEAT_TRANSITIONS,
  bedsFree,
  canBecome,
  houseRefusal,
  houseFilter,
  isOverdue,
  outsideScope,
  roomTone,
  scopeOfHouses,
  withinScope,
} from "../src/lib/boarding-rules";

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

console.log("\nWho may sleep where\n");

check("a boy into a boys' house", houseRefusal("MALE", "BOYS"), null);
check("a girl into a girls' house", houseRefusal("FEMALE", "GIRLS"), null);
check("a boy into a girls' house", houseRefusal("MALE", "GIRLS"), "This is a girls' house.");
check("a girl into a boys' house", houseRefusal("FEMALE", "BOYS"), "This is a boys' house.");
check("anybody into a mixed house", houseRefusal("MALE", "MIXED"), null);
check("a girl into a mixed house", houseRefusal("FEMALE", "MIXED"), null);

// Deliberately not refused. A school that has recorded a child's sex as either
// of these has decided something this function is not entitled to overrule.
check("OTHER is not refused a boys' house", houseRefusal("OTHER", "BOYS"), null);
check("UNDISCLOSED is not refused a girls' house", houseRefusal("UNDISCLOSED", "GIRLS"), null);
check("a missing sex is not refused", houseRefusal(null, "BOYS"), null);

console.log("\nBeds\n");

check("a room with room", bedsFree(8, 5), 3);
check("a full room", bedsFree(8, 8), 0);
// Over-full is possible: the free-text fields this replaced routinely produced
// it, and an import can too. It reports zero free rather than a negative,
// which would read as beds available.
check("an over-full room reports no beds, not minus one", bedsFree(8, 11), 0);
check("a full room is a warning", roomTone(8, 8), "warning");
check("an over-full room is a problem", roomTone(8, 9), "danger");
check("a room with space is fine", roomTone(8, 2), "success");

console.log("\nExeat transitions\n");

check("a request can be approved", canBecome("REQUESTED", "APPROVED"), true);
check("a request can be turned down", canBecome("REQUESTED", "CANCELLED"), true);
// The gate cannot release a child nobody has approved.
check("a request cannot go straight out", canBecome("REQUESTED", "OUT"), false);
check("an approved child can be signed out", canBecome("APPROVED", "OUT"), true);
check("an approved exeat can still be withdrawn", canBecome("APPROVED", "CANCELLED"), true);
check("a child who is out can be signed in", canBecome("OUT", "RETURNED"), true);
// Once they are out, cancelling would erase the fact that they left.
check("a child who is out cannot be cancelled", canBecome("OUT", "CANCELLED"), false);
check("a child who is out cannot be un-approved", canBecome("OUT", "APPROVED"), false);

// RETURNED is terminal. A second leave-out is a second record, with its own
// reason, its own approval and its own person at the gate.
check("returned is the end of it", EXEAT_TRANSITIONS.RETURNED, []);
check("cancelled is the end of it", EXEAT_TRANSITIONS.CANCELLED, []);
check("a returned exeat cannot be sent out again", canBecome("RETURNED", "OUT"), false);
check("nothing unknown is allowed", canBecome("NONSENSE", "OUT"), false);

console.log("\nOverdue\n");

const due = new Date("2026-03-16T18:00:00Z");
const before = new Date("2026-03-16T17:30:00Z");
const after = new Date("2026-03-16T18:30:00Z");

check(
  "out and past the hour",
  isOverdue({ status: "OUT", dueBackAt: due }, after),
  true,
);
check(
  "out and still in time",
  isOverdue({ status: "OUT", dueBackAt: due }, before),
  false,
);
// Only a child who is actually out can be late back. An approved exeat whose
// hour has passed is a trip that did not happen, not a missing child.
check(
  "approved but never left is not overdue",
  isOverdue({ status: "APPROVED", dueBackAt: due }, after),
  false,
);
check(
  "already back is not overdue",
  isOverdue({ status: "RETURNED", dueBackAt: due }, after),
  false,
);
check(
  "a date arriving as a string still compares",
  isOverdue({ status: "OUT", dueBackAt: due.toISOString() }, after),
  true,
);
check(
  "exactly on the hour is not yet late",
  isOverdue({ status: "OUT", dueBackAt: due }, due),
  false,
);

// -----------------------------------------------------------------------------
// Whose house
//
// The half of boarding that is about privacy rather than beds. A house parent
// sees their own house; whoever runs boarding sees all of them. The screens
// filter by this and the actions refuse by it, so what is worth pinning is
// that both readings agree and that the empty cases are the safe way round.
// -----------------------------------------------------------------------------

const everything = EVERY_HOUSE;
const rutherford = scopeOfHouses(["rutherford"]);
const two = scopeOfHouses(["rutherford", "aggrey"]);
const nowhere = scopeOfHouses([]);

check("everything covers a house", withinScope(everything, "rutherford"), true);
check("and any other house", withinScope(everything, "aggrey"), true);

// A boarder with no bed has no house. For somebody who sees the school that
// is still theirs to deal with; for a house parent it is nobody in
// particular, and the answer has to be no rather than a permissive null.
check("everything covers a boarder with no house", withinScope(everything, null), true);
check("a house parent does not cover a boarder with no house", withinScope(rutherford, null), false);
check("nor an undefined one", withinScope(rutherford, undefined), false);

check("their own house", withinScope(rutherford, "rutherford"), true);
check("not another one", withinScope(rutherford, "aggrey"), false);
check("two houses, first", withinScope(two, "rutherford"), true);
check("two houses, second", withinScope(two, "aggrey"), true);
check("two houses, neither", withinScope(two, "guggisberg"), false);

// The dangerous default. Somebody with the scoped permission and no house
// recorded must see nothing, not everything: an empty list of houses read as
// "no filter" is how a scope becomes decoration.
check("no house recorded covers nothing", withinScope(nowhere, "rutherford"), false);
check("not even a boarder with no house", withinScope(nowhere, null), false);

// The filter the queries spread in has to say the same thing as withinScope.
check("everything filters nothing", JSON.stringify(houseFilter(everything)), "{}");
check(
  "a house parent filters to their houses",
  JSON.stringify(houseFilter(two)),
  JSON.stringify({ houseId: { in: ["rutherford", "aggrey"] } }),
);
check(
  "no house recorded filters to nothing at all",
  JSON.stringify(houseFilter(nowhere)),
  JSON.stringify({ houseId: { in: [] } }),
);

// The refusal, which is the same rule read the other way round: anything
// withinScope allows, outsideScope must not refuse, and the reverse.
for (const [label, scope] of [
  ["everything", everything],
  ["one house", rutherford],
  ["two houses", two],
  ["no house", nowhere],
] as const) {
  for (const houseId of ["rutherford", "aggrey", null]) {
    check(
      `${label} agrees with itself about ${houseId ?? "no house"}`,
      outsideScope(scope, houseId) === null,
      withinScope(scope, houseId),
    );
  }
}

check("a house parent is refused another house", typeof outsideScope(rutherford, "aggrey"), "string");
check("and not their own", outsideScope(rutherford, "rutherford"), null);
check("everybody is allowed everything", outsideScope(everything, "aggrey"), null);

// The two refusals say different things, because they need different fixes:
// one is somebody reaching past their house, the other is a house parent
// nobody has recorded as the parent of anything.
const wrongHouse = outsideScope(rutherford, "aggrey", "Ama Serwaa") ?? "";
const noHouse = outsideScope(nowhere, "aggrey") ?? "";
check("the wrong house names the boarder", wrongHouse.startsWith("Ama Serwaa is not in your house"), true);
check("a house parent with no house is told so", noHouse.includes("not recorded as the parent of any house"), true);
check("and the two differ", wrongHouse === noHouse, false);
check("a lower-case name is capitalised", (outsideScope(rutherford, "aggrey") ?? "").startsWith("That boarder"), true);

console.log(
  failures ? `\n  ${failures} FAILURE(S)\n` : "\n  Every case behaves as written.\n",
);
process.exit(failures ? 1 : 0);
