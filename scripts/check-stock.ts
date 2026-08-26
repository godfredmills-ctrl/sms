/**
 * Tests for the school store's arithmetic.
 *
 * Weighted-average valuation is the reason this file exists. Every way of
 * getting it wrong — rounding the average and multiplying it back out, valuing
 * an issue at the price of the last delivery, letting a shelf go negative,
 * leaving pesewas behind on an empty shelf — produces a store total that looks
 * entirely plausible and reconciles to nothing.
 */

import {
  expiryState,
  formatQuantity,
  formatUnits,
  fromMilli,
  isInward,
  issueValueMinor,
  MOVEMENT_KINDS,
  movementLabel,
  pluraliseUnit,
  runningStock,
  signedQuantityMilli,
  stockLevel,
  stocktakeVariance,
  storeTotals,
  suggestedOrderMilli,
  toMilli,
  type Movement,
} from "../src/lib/stock-rules";

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

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);

const receipt = (quantity: number, unitCostMinor: number): Movement => ({
  kind: "RECEIPT",
  quantityMilli: toMilli(quantity),
  unitCostMinor,
});
const issue = (quantity: number): Movement => ({
  kind: "ISSUE",
  quantityMilli: toMilli(quantity),
});
const waste = (quantity: number): Movement => ({
  kind: "WASTE",
  quantityMilli: toMilli(quantity),
});
const returned = (quantity: number): Movement => ({
  kind: "RETURN",
  quantityMilli: toMilli(quantity),
});
const adjust = (quantity: number): Movement => ({
  kind: quantity >= 0 ? "ADJUSTMENT_UP" : "ADJUSTMENT_DOWN",
  quantityMilli: toMilli(Math.abs(quantity)),
});

// -----------------------------------------------------------------------------
// Milli-units
// -----------------------------------------------------------------------------

check("whole units convert", toMilli(12), 12_000);
check("halves convert", toMilli(2.5), 2_500);
check("thousandths convert", toMilli(0.001), 1);
check("and back again", fromMilli(2_500), 2.5);
// The reason quantities are integers at all: this is 0.30000000000000004 in floats.
check("a hundred tenths is exactly ten", toMilli(0.1) * 100, 10_000);
check("whole numbers print plainly", formatQuantity(12_000), "12");
check("fractions print without padding", formatQuantity(2_500), "2.5");
check("thousandths survive printing", formatQuantity(1_250), "1.25");
check("zero prints as zero", formatQuantity(0), "0");

// The unit has to agree with the number in front of it: "6 sack" is the first
// thing anybody notices on a voucher they are signing.
check("exactly one stays singular", formatUnits(1_000, "sack"), "1 sack");
check("more than one is plural", formatUnits(6_000, "sack"), "6 sacks");
check("a fraction is plural too", formatUnits(2_500, "litre"), "2.5 litres");
check("less than one is plural", formatUnits(500, "litre"), "0.5 litres");
check("none is plural", formatUnits(0, "ream"), "0 reams");
check("box takes -es", pluraliseUnit("box", 6_000), "boxes");
check("bunch takes -es", pluraliseUnit("bunch", 6_000), "bunches");
check("each is invariant", pluraliseUnit("each", 6_000), "each");
check("and singular each is still each", pluraliseUnit("each", 1_000), "each");
// A supplier who writes the unit already plural must not get "packss".
check("an already plural unit is left alone", pluraliseUnit("packs", 6_000), "packs");
check("case is preserved", pluraliseUnit("Sack", 6_000), "Sacks");
check("an empty unit yields nothing", formatUnits(6_000, ""), "6");

// -----------------------------------------------------------------------------
// Direction
// -----------------------------------------------------------------------------

ok("a receipt comes in", isInward("RECEIPT"));
ok("an opening balance comes in", isInward("OPENING"));
ok("a return comes in", isInward("RETURN"));
ok("an issue goes out", !isInward("ISSUE"));
ok("waste goes out", !isInward("WASTE"));

check("an issue is negative", signedQuantityMilli(issue(3)), -3_000);
check("a receipt is positive", signedQuantityMilli(receipt(3, 100)), 3_000);
// A correction is two kinds rather than one carrying a sign, so a stored row
// can never say "issue, +5" and be read two ways.
check("a shortage adjustment writes stock off", signedQuantityMilli(adjust(-2)), -2_000);
check("a found adjustment adds it", signedQuantityMilli(adjust(2)), 2_000);
check("a shortage is outward", isInward("ADJUSTMENT_DOWN"), false);
check("a found adjustment is inward", isInward("ADJUSTMENT_UP"), true);
// Even a quantity handed in negative cannot flip a kind's direction.
check(
  "the kind wins over a stray sign",
  signedQuantityMilli({ kind: "ISSUE", quantityMilli: -3_000 }),
  -3_000,
);
check(
  "and over a stray positive on an outward kind",
  signedQuantityMilli({ kind: "WASTE", quantityMilli: 3_000 }),
  -3_000,
);

check("a known kind has a label", movementLabel("WASTE"), "Written off");
check("an unknown kind shows as itself", movementLabel("NONSENSE"), "NONSENSE");

// -----------------------------------------------------------------------------
// Weighted average
// -----------------------------------------------------------------------------

// 100 exercise books at GH₵2.00, then 100 more at GH₵3.00 → average GH₵2.50.
const twoDeliveries = runningStock([receipt(100, 200), receipt(100, 300)]);
check("both deliveries are on the shelf", twoDeliveries.quantityMilli, 200_000);
check("and worth what was paid for them", twoDeliveries.valueMinor, 50_000);
check("the average is between the two prices", twoDeliveries.averageCostMinor, 250);

// Issuing does not change the average — it takes value out at it.
const afterIssue = runningStock([receipt(100, 200), receipt(100, 300), issue(50)]);
check("the shelf comes down", afterIssue.quantityMilli, 150_000);
check("value leaves at the average", afterIssue.valueMinor, 37_500);
check("the average is untouched by an issue", afterIssue.averageCostMinor, 250);

// The order matters, and that is the whole point of the method: goods issued
// before a delivery arrived are valued at the old average.
const issuedFirst = runningStock([receipt(100, 200), issue(50), receipt(100, 300)]);
check("issued before the second delivery", issuedFirst.quantityMilli, 150_000);
check("so it left at the old price", issuedFirst.valueMinor, 40_000);

// A return comes back at the current average, not at what it originally cost —
// it was never bought a second time.
const withReturn = runningStock([receipt(100, 200), receipt(100, 300), issue(50), returned(10)]);
check("a return puts the quantity back", withReturn.quantityMilli, 160_000);
check("at the running average", withReturn.valueMinor, 40_000);
check("leaving the average alone", withReturn.averageCostMinor, 250);

// An empty shelf is worth nothing at all — not a few pesewas of rounding.
const emptied = runningStock([receipt(3, 333), issue(3)]);
check("an emptied shelf holds no quantity", emptied.quantityMilli, 0);
check("and no value", emptied.valueMinor, 0);
check("and has no average cost", emptied.averageCostMinor, null);

// The awkward case: a price that does not divide evenly across the quantity.
const awkward = runningStock([receipt(3, 1_000), receipt(7, 333)]);
check("an indivisible average still balances", awkward.quantityMilli, 10_000);
check("value is the sum of what was paid", awkward.valueMinor, 3_000 + 2_331);

// Emptying it must return exactly to zero however awkward the arithmetic.
for (const [quantity, cost] of [
  [3, 1_000],
  [7, 333],
  [11, 97],
  [2.5, 449],
] as const) {
  const cleared = runningStock([receipt(quantity, cost), issue(quantity)]);
  check(`emptying ${quantity} @ ${cost} returns to zero value`, cleared.valueMinor, 0);
  check(`emptying ${quantity} @ ${cost} returns to zero quantity`, cleared.quantityMilli, 0);
}

// Waste leaves at the average, exactly as an issue does.
const wasted = runningStock([receipt(100, 200), waste(10)]);
check("waste comes off the shelf", wasted.quantityMilli, 90_000);
check("and takes its value with it", wasted.valueMinor, 18_000);

// Adjustments both ways.
const adjustedDown = runningStock([receipt(100, 200), adjust(-5)]);
check("a negative adjustment reduces the shelf", adjustedDown.quantityMilli, 95_000);
check("and its value", adjustedDown.valueMinor, 19_000);

const adjustedUp = runningStock([receipt(100, 200), adjust(5)]);
check("a positive adjustment adds to the shelf", adjustedUp.quantityMilli, 105_000);
check("at the average, so the average holds", adjustedUp.averageCostMinor, 200);

// -----------------------------------------------------------------------------
// Going below zero
// -----------------------------------------------------------------------------

// A store cannot issue what it does not have. The shelf stops at zero and the
// attempt is counted, rather than a negative balance nobody can reconcile.
const oversold = runningStock([receipt(10, 500), issue(15)]);
check("the shelf stops at empty", oversold.quantityMilli, 0);
check("with no value left", oversold.valueMinor, 0);
check("and the attempt is reported", oversold.oversold, 1);
check("a store that never oversold reports none", afterIssue.oversold, 0);

check("nothing on the shelf, nothing on the books", runningStock([]).quantityMilli, 0);
check("and no average", runningStock([]).averageCostMinor, null);
check("issuing from an empty store is reported", runningStock([issue(1)]).oversold, 1);

// A receipt onto an empty shelf sets the average outright.
const restocked = runningStock([receipt(10, 500), issue(10), receipt(4, 900)]);
check("a delivery onto an empty shelf sets the price", restocked.averageCostMinor, 900);
check("with nothing carried over", restocked.valueMinor, 3_600);

// An opening balance behaves as a receipt.
const opened = runningStock([
  { kind: "OPENING", quantityMilli: toMilli(40), unitCostMinor: 150 },
]);
check("an opening balance stocks the shelf", opened.quantityMilli, 40_000);
check("at the price it was counted in at", opened.valueMinor, 6_000);

// A receipt with no price given must not silently value the goods at zero.
const noPrice = runningStock([receipt(10, 200), { kind: "RECEIPT", quantityMilli: 10_000 }]);
check("a priceless receipt takes the running average", noPrice.averageCostMinor, 200);
check("so the shelf value follows the quantity", noPrice.valueMinor, 4_000);

// -----------------------------------------------------------------------------
// Issue valuation
// -----------------------------------------------------------------------------

check("what an issue would cost", issueValueMinor(twoDeliveries, toMilli(20)), 5_000);
check("issuing nothing costs nothing", issueValueMinor(twoDeliveries, 0), 0);
check("an empty shelf values an issue at nothing", issueValueMinor(emptied, toMilli(5)), 0);

// -----------------------------------------------------------------------------
// Reorder levels
// -----------------------------------------------------------------------------

check("plenty on the shelf", stockLevel(50_000, 10_000), "OK");
check("at the reorder level counts as low", stockLevel(10_000, 10_000), "LOW");
check("below it is low", stockLevel(9_000, 10_000), "LOW");
check("nothing left is out", stockLevel(0, 10_000), "OUT");
// A negative balance should never occur, but if one does it is not "fine".
check("a negative balance is out", stockLevel(-500, 10_000), "OUT");
// No reorder level is not the same as being comfortable.
check("no reorder level is untracked, not OK", stockLevel(50_000, null), "UNTRACKED");
check("a zero reorder level is untracked too", stockLevel(50_000, 0), "UNTRACKED");
check("but an empty shelf is out whatever the level", stockLevel(0, null), "OUT");

check("order back up to the target", suggestedOrderMilli(2_000, 10_000, 50_000), 48_000);
check("or to the reorder level when there is no target", suggestedOrderMilli(2_000, 10_000, null), 8_000);
check("nothing to order when comfortable", suggestedOrderMilli(60_000, 10_000, 50_000), 0);
check("nothing to order when untracked", suggestedOrderMilli(2_000, null, null), 0);
// A supplier does not deliver two thirds of a sack.
check("rounded up to a whole unit", suggestedOrderMilli(1_500, 10_000, null), 9_000);

// -----------------------------------------------------------------------------
// Expiry
// -----------------------------------------------------------------------------

check("no date is no concern", expiryState(null, local(2026, 6, 1)), "none");
check("well in the future is fresh", expiryState(local(2026, 12, 1), local(2026, 6, 1)), "fresh");
check("within the month is soon", expiryState(local(2026, 6, 20), local(2026, 6, 1)), "soon");
check("yesterday is expired", expiryState(local(2026, 5, 31), local(2026, 6, 1)), "expired");

// -----------------------------------------------------------------------------
// Stock-take
// -----------------------------------------------------------------------------

const shelf = runningStock([receipt(100, 250)]);

const short = stocktakeVariance(shelf, toMilli(94));
check("the book said a hundred", short.expectedMilli, 100_000);
check("the count found ninety-four", short.countedMilli, 94_000);
check("six are missing", short.differenceMilli, -6_000);
ok("which is a shortage, not an overage", !short.overage);
check("valued at the average", short.valueMinor, 1_500);
ok("and it does not agree", !short.agrees);

const over = stocktakeVariance(shelf, toMilli(103));
ok("finding more is an overage", over.overage);
check("also valued", over.valueMinor, 750);

const exact = stocktakeVariance(shelf, toMilli(100));
ok("a count that matches agrees", exact.agrees);
check("with nothing to explain", exact.valueMinor, 0);

// -----------------------------------------------------------------------------
// The store, totalled
// -----------------------------------------------------------------------------

const totals = storeTotals(
  [
    { quantityMilli: 50_000, valueMinor: 12_500, reorderLevelMilli: 10_000 },
    { quantityMilli: 5_000, valueMinor: 1_250, reorderLevelMilli: 10_000 },
    { quantityMilli: 0, valueMinor: 0, reorderLevelMilli: 10_000 },
    { quantityMilli: 20_000, valueMinor: 4_000, reorderLevelMilli: null },
    {
      quantityMilli: 8_000,
      valueMinor: 3_200,
      reorderLevelMilli: 20_000,
      expiresOn: local(2026, 5, 1),
    },
    // Expired, but there is none left — used up in time, so not a problem.
    {
      quantityMilli: 0,
      valueMinor: 0,
      reorderLevelMilli: 5_000,
      expiresOn: local(2026, 5, 1),
    },
  ],
  local(2026, 6, 1),
);

check("every line is counted", totals.items, 6);
check("the store's value is the sum", totals.valueMinor, 12_500 + 1_250 + 4_000 + 3_200);
check("two shelves are empty", totals.outOfStock, 2);
check("two are low", totals.low, 2);
check("one is untracked", totals.untracked, 1);
// The expired line with nothing on it must not be counted as a problem.
check("only stock that exists can be expired", totals.expired, 1);
check("an empty store totals to nothing", storeTotals([], local(2026, 6, 1)).valueMinor, 0);

// -----------------------------------------------------------------------------
// The catalogue itself
// -----------------------------------------------------------------------------

ok(
  "every movement kind has a distinct value",
  new Set(MOVEMENT_KINDS.map((entry) => entry.value)).size === MOVEMENT_KINDS.length,
);
ok("every movement kind explains itself", MOVEMENT_KINDS.every((entry) => entry.blurb.length > 0));

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} stock checks passed.`);
