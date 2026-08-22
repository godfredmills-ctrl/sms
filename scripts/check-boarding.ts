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
  EXEAT_TRANSITIONS,
  bedsFree,
  canBecome,
  houseRefusal,
  isOverdue,
  roomTone,
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

console.log(
  failures ? `\n  ${failures} FAILURE(S)\n` : "\n  Every case behaves as written.\n",
);
process.exit(failures ? 1 : 0);
