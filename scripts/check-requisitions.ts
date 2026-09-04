/**
 * Tests for requisition arithmetic.
 *
 * Three things here are worth pinning.
 *
 * The commitment. It is the number the system could not produce before, it is
 * the reason the module exists, and it is arithmetic nobody checks by hand: a
 * budget line reads as healthy while four approved requests sit in a drawer.
 *
 * Partial delivery. Half an order arriving must release half the commitment,
 * not all of it and not none. Both wrong answers look plausible on a screen.
 *
 * The transition table, which the screen draws buttons from and the action
 * refuses from. A button that appears and then fails is what it prevents.
 */

import {
  STATUSES,
  TRANSITIONS,
  allowedTransitions,
  budgetTone,
  canTransition,
  committed,
  editable,
  estimateTotal,
  fulfilment,
  lineProblem,
  lineTotal,
  outstandingTotal,
  refusal,
  statusHint,
  statusLabel,
  statusTone,
  verdictFor,
  type Line,
  type Role,
} from "../src/lib/requisition-rules";

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

const line = (over: Partial<Line> = {}): Line => ({
  description: "Exercise books, 80 leaves",
  quantity: 10,
  estimatedUnitMinor: 350,
  ...over,
});

// -----------------------------------------------------------------------------
// What it costs
// -----------------------------------------------------------------------------

check("one line", lineTotal(line()), 3500);
check("a single unit", lineTotal(line({ quantity: 1 })), 350);
check("free of charge is nothing, not an error", lineTotal(line({ estimatedUnitMinor: 0 })), 0);
check("a negative price cannot make a negative cost", lineTotal(line({ estimatedUnitMinor: -500 })), 0);

// Money is minor units throughout, so a fractional unit price would otherwise
// leave a fraction of a pesewa in a total that is compared against a budget.
check("a fractional price rounds", lineTotal(line({ quantity: 3, estimatedUnitMinor: 333.4 })), 1000);

check("nothing asked for costs nothing", estimateTotal([]), 0);
check(
  "the whole request",
  estimateTotal([line(), line({ quantity: 2, estimatedUnitMinor: 12000 })]),
  3500 + 24000,
);

// -----------------------------------------------------------------------------
// What is still outstanding
//
// The figure that stays committed against the budget. Half a delivery has to
// release half the commitment: releasing all of it overstates what is left,
// and releasing none of it understates it until somebody closes the request.
// -----------------------------------------------------------------------------

check("nothing received is all outstanding", outstandingTotal([line()]), 3500);
check("half received is half outstanding", outstandingTotal([line({ fulfilledQty: 5 })]), 1750);
check("all received is nothing outstanding", outstandingTotal([line({ fulfilledQty: 10 })]), 0);
check("more received than asked is not negative", outstandingTotal([line({ fulfilledQty: 14 })]), 0);
check(
  "across lines",
  outstandingTotal([
    line({ fulfilledQty: 5 }),
    line({ quantity: 4, estimatedUnitMinor: 10000, fulfilledQty: 1 }),
  ]),
  1750 + 30000,
);

check("nothing at all", fulfilment([]), "none");
check("nothing received", fulfilment([line()]), "none");
check("some received", fulfilment([line({ fulfilledQty: 5 })]), "partial");
check("all received", fulfilment([line({ fulfilledQty: 10 })]), "full");
check(
  "one line short is still partial",
  fulfilment([line({ fulfilledQty: 10 }), line({ fulfilledQty: 9 })]),
  "partial",
);
check(
  "both lines complete is full",
  fulfilment([line({ fulfilledQty: 10 }), line({ fulfilledQty: 10 })]),
  "full",
);
check("over-delivery does not become partial", fulfilment([line({ fulfilledQty: 99 })]), "full");

// -----------------------------------------------------------------------------
// What is wrong with a line
// -----------------------------------------------------------------------------

check("a good line", lineProblem(line()), null);
check("no description", lineProblem(line({ description: "  " })), "Say what it is.");
check(
  "no quantity",
  lineProblem(line({ quantity: 0 })),
  "How many? A request for none of something is not a request.",
);
check("a negative quantity", lineProblem(line({ quantity: -3 })) !== null, true);
check("half a book", lineProblem(line({ quantity: 2.5 })), "Whole units only.");
check("a warehouse", lineProblem(line({ quantity: 500_000 })) !== null, true);
check("a free item is fine", lineProblem(line({ estimatedUnitMinor: 0 })), null);
check("a negative price", lineProblem(line({ estimatedUnitMinor: -1 })) !== null, true);

// The pesewas in the wrong place: 250,000 cedis for one exercise book. The
// budget warning would never fire because nothing is ever that big.
check("a price with the decimal misplaced", lineProblem(line({ estimatedUnitMinor: 25_000_000_00 })) !== null, true);

check("received more than asked", lineProblem(line({ fulfilledQty: 11 })) !== null, true);
check("received exactly", lineProblem(line({ fulfilledQty: 10 })), null);
check("received nothing", lineProblem(line({ fulfilledQty: 0 })), null);

// -----------------------------------------------------------------------------
// The budget
//
// The reason for the module. Every one of these is a figure somebody would
// otherwise work out on paper, and the one that matters is committed: a line
// that reads as healthy because four approved requests are not counted.
// -----------------------------------------------------------------------------

const clear = { budgetMinor: 1_000_000, spentMinor: 200_000, committedMinor: 0 };

check("what is left", verdictFor(clear, 0).remainingMinor, 800_000);
check("what would be left", verdictFor(clear, 300_000).wouldRemainMinor, 500_000);
ok("comfortably within", !verdictFor(clear, 300_000).overBudget);

// The whole point: an approved request that has not arrived is spent as far as
// this question is concerned.
const withCommitments = { budgetMinor: 1_000_000, spentMinor: 200_000, committedMinor: 500_000 };
check("commitments count against the line", verdictFor(withCommitments, 0).remainingMinor, 300_000);
ok(
  "a request that fits the cash but not the commitments is over",
  verdictFor(withCommitments, 400_000).overBudget,
);
check("and by how much", verdictFor(withCommitments, 400_000).overByMinor, 100_000);
ok(
  "the same request against the same spend with nothing committed is not",
  !verdictFor(clear, 400_000).overBudget,
);

// Exactly to the penny is not over. Spending the last cedi of a budget is
// what a budget is for, and a warning there would fire on every well-planned
// year-end.
check("exactly to the last pesewa", verdictFor(clear, 800_000).wouldRemainMinor, 0);
ok("which is not over budget", !verdictFor(clear, 800_000).overBudget);
ok("one pesewa more is", verdictFor(clear, 800_001).overBudget);
check("by one pesewa", verdictFor(clear, 800_001).overByMinor, 1);

// Already over before this request: the arithmetic must keep working rather
// than reporting the request as the whole overspend.
const already = { budgetMinor: 100_000, spentMinor: 150_000, committedMinor: 0 };
check("already over, before asking", verdictFor(already, 0).remainingMinor, -50_000);
check("asking for more deepens it", verdictFor(already, 10_000).overByMinor, 60_000);

// No budget is not a budget of zero. Reporting every request against an
// unbudgeted category as an overspend teaches people the warning means nothing.
const none = { budgetMinor: null, spentMinor: 400_000, committedMinor: 0 };
ok("no budget is unbudgeted", verdictFor(none, 900_000).unbudgeted);
ok("and not over budget", !verdictFor(none, 900_000).overBudget);
check("with nothing to report as left", verdictFor(none, 900_000).remainingMinor, null);
check("or as remaining after", verdictFor(none, 900_000).wouldRemainMinor, null);
check("and nothing over", verdictFor(none, 900_000).overByMinor, 0);

check("a zero budget with a request is fully used", verdictFor({ budgetMinor: 0, spentMinor: 0, committedMinor: 0 }, 1).usedRatio, 2);
check("a zero budget with no request is not", verdictFor({ budgetMinor: 0, spentMinor: 0, committedMinor: 0 }, 0).usedRatio, 0);

check("comfortable reads well", budgetTone(verdictFor(clear, 100_000)), "success");
check("nearly gone reads as a warning", budgetTone(verdictFor(clear, 750_000)), "warning");
check("over reads badly", budgetTone(verdictFor(clear, 900_000)), "danger");
check("unbudgeted reads as neither", budgetTone(verdictFor(none, 900_000)), "neutral");

// -----------------------------------------------------------------------------
// Where it has got to
// -----------------------------------------------------------------------------

check("six states", STATUSES.length, 6);
check("each has a label", STATUSES.every((status) => status.label), true);
check("each has a hint", STATUSES.every((status) => status.hint), true);
check("labels are unique", new Set(STATUSES.map((s) => s.label)).size, 6);
check("a known status", statusLabel("SUBMITTED"), "Waiting for approval");
check("an unknown one is shown as itself", statusLabel("MYSTERY"), "MYSTERY");
check("approved reads well", statusTone("APPROVED"), "success");
check("turned down reads badly", statusTone("REJECTED"), "danger");
check("an unknown status has no tone", statusTone("MYSTERY"), "neutral");
check("an unknown status has no hint", statusHint("MYSTERY"), "");

ok("a draft may be edited", editable("DRAFT"));
ok("something waiting may not", !editable("SUBMITTED"));
ok("nor something approved", !editable("APPROVED"));

// Only an approved request is committed. A draft is a thought, and something
// already met has become a bill, which the spent figure counts: counting both
// would charge the budget twice for one order.
ok("approved is committed", committed("APPROVED"));
ok("a draft is not", !committed("DRAFT"));
ok("nor is one waiting", !committed("SUBMITTED"));
ok("and one already met is not, or it would be counted twice", !committed("FULFILLED"));

// -----------------------------------------------------------------------------
// Who may do what
// -----------------------------------------------------------------------------

const requester: Role[] = ["requester"];
const approver: Role[] = ["approver"];
const both: Role[] = ["requester", "approver"];
const storekeeper: Role[] = ["storekeeper"];

check(
  "a requester with a draft",
  allowedTransitions("DRAFT", requester).map((t) => t.to).sort(),
  ["CANCELLED", "SUBMITTED"],
);
check("an approver cannot touch somebody draft", allowedTransitions("DRAFT", approver).length, 0);
check(
  "an approver with something waiting",
  allowedTransitions("SUBMITTED", approver).map((t) => t.to).sort(),
  ["APPROVED", "REJECTED"],
);
check(
  "a requester may still withdraw it",
  allowedTransitions("SUBMITTED", requester).map((t) => t.to),
  ["CANCELLED"],
);
check(
  "somebody who is both sees all three",
  allowedTransitions("SUBMITTED", both).map((t) => t.to).sort(),
  ["APPROVED", "CANCELLED", "REJECTED"],
);
check(
  "the store marks it met",
  allowedTransitions("APPROVED", storekeeper).map((t) => t.to),
  ["FULFILLED"],
);
check("nothing follows a cancelled request", allowedTransitions("CANCELLED", both).length, 0);
check("nor a met one", allowedTransitions("FULFILLED", both).length, 0);

ok("a turned-down request can be reopened", canTransition("REJECTED", "DRAFT", requester));
ok("but not by the approver", !canTransition("REJECTED", "DRAFT", approver));
ok("a draft cannot be approved straight off", !canTransition("DRAFT", "APPROVED", approver));
ok("nor can something met be reopened", !canTransition("FULFILLED", "DRAFT", both));

// Every transition names a state the table knows about, or the screen draws a
// button leading nowhere.
const known = new Set(STATUSES.map((status) => status.value));
ok(
  "every transition is between real states",
  TRANSITIONS.every((t) => known.has(t.from) && known.has(t.to)),
);
ok("and none is a loop", TRANSITIONS.every((t) => t.from !== t.to));

// -----------------------------------------------------------------------------
// Refusals
// -----------------------------------------------------------------------------

const decision = (over: Partial<Parameters<typeof refusal>[0]> = {}) =>
  refusal({
    from: "SUBMITTED",
    to: "APPROVED",
    roles: approver,
    own: false,
    note: "",
    lines: [line()],
    verdict: verdictFor(clear, 3500),
    ...over,
  });

check("an ordinary approval", decision(), null);

// The one that matters.
check(
  "nobody approves their own",
  decision({ own: true }),
  "You cannot decide your own requisition. Somebody else has to, which is the whole of what a requisition is for.",
);
check("nor turns down their own", decision({ to: "REJECTED", own: true, note: "No" }) !== null, true);
check("but may withdraw their own", decision({ to: "CANCELLED", roles: both, own: true }), null);

check(
  "a step that is not allowed",
  decision({ from: "DRAFT", to: "FULFILLED", roles: storekeeper }) !== null,
  true,
);

check(
  "turning down without a reason",
  decision({ to: "REJECTED", note: "  " }),
  "Say why it is being turned down. Somebody has to know what to change.",
);
check("turning down with one", decision({ to: "REJECTED", note: "Ask the store first." }), null);

check(
  "sending nothing for approval",
  decision({ from: "DRAFT", to: "SUBMITTED", roles: requester, lines: [] }),
  "Add what you are asking for before sending it.",
);
check(
  "sending a line with no description",
  decision({
    from: "DRAFT",
    to: "SUBMITTED",
    roles: requester,
    lines: [line({ description: "" })],
  }),
  "Say what it is.",
);

// Over budget is allowed and is not silent. Refusing outright would be worked
// around by not raising the requisition at all, which loses the record as well
// as the control.
check(
  "approving over budget without a word",
  decision({ verdict: verdictFor(clear, 900_000) }),
  "This takes the line over its budget. Approving it is allowed; doing it silently is not, so say why.",
);
check(
  "approving over budget with a reason",
  decision({ verdict: verdictFor(clear, 900_000), note: "The generator failed. Head agreed." }),
  null,
);
check(
  "an unbudgeted category needs no such reason",
  decision({ verdict: verdictFor(none, 900_000) }),
  null,
);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    x ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} requisition checks passed.`);
