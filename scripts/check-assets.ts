/**
 * Tests for the asset register's arithmetic.
 *
 * Depreciation is the reason this file exists. It is the one number in the
 * module that an auditor recomputes by hand, and every way of getting it wrong
 * — rounding each month, charging a full year for a projector bought in June,
 * depreciating past the residual value, going on depreciating a bus that was
 * sold — produces a figure that looks perfectly reasonable on screen.
 */

import {
  addMonths,
  assetTag,
  conditionLabel,
  depreciate,
  disposalResult,
  isHeld,
  isInService,
  monthsBetween,
  registerTotals,
  residualFromPercent,
  serviceState,
  statusLabel,
  tagSequence,
  verificationState,
  ASSET_CONDITIONS,
  ASSET_STATUSES,
} from "../src/lib/asset-rules";

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

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Dates are compared by calendar position, so construct them in local time to
// match how monthsBetween reads getMonth/getDate.
const local = (y: number, m: number, day: number) => new Date(y, m - 1, day);

// -----------------------------------------------------------------------------
// Months
// -----------------------------------------------------------------------------

check("a month is not served until the day comes round", monthsBetween(local(2026, 1, 20), local(2026, 2, 3)), 0);
check("the day it comes round, it counts", monthsBetween(local(2026, 1, 20), local(2026, 2, 20)), 1);
check("the day before, it does not", monthsBetween(local(2026, 1, 20), local(2026, 2, 19)), 0);
check("a whole year", monthsBetween(local(2025, 6, 1), local(2026, 6, 1)), 12);
check("across a year boundary", monthsBetween(local(2025, 11, 15), local(2026, 2, 15)), 3);
check("a date in the past is no months, never negative", monthsBetween(local(2026, 6, 1), local(2025, 6, 1)), 0);
check("the same day is no months", monthsBetween(local(2026, 6, 1), local(2026, 6, 1)), 0);
// 31 January + 1 month must not become 3 March.
check("month-end does not overflow", addMonths(local(2026, 1, 31), 1).getMonth(), 1);
check("month-end lands on the last valid day", addMonths(local(2026, 1, 31), 1).getDate(), 28);

// -----------------------------------------------------------------------------
// Depreciation
// -----------------------------------------------------------------------------

// A GH₵12,000 laptop, five-year life, no residual.
const laptop = {
  costMinor: 1_200_000,
  residualMinor: 0,
  usefulLifeYears: 5,
  purchasedOn: local(2024, 1, 1),
};

check("nothing on the day it arrives", depreciate(laptop, local(2024, 1, 1)).accumulatedMinor, 0);
check("net book on day one is cost", depreciate(laptop, local(2024, 1, 1)).netBookMinor, 1_200_000);
check("one year in, one fifth is gone", depreciate(laptop, local(2025, 1, 1)).accumulatedMinor, 240_000);
check("one year in, four fifths remain", depreciate(laptop, local(2025, 1, 1)).netBookMinor, 960_000);
check("the annual charge is stated", depreciate(laptop, local(2025, 1, 1)).annualMinor, 240_000);
check("six months in, half a year's charge", depreciate(laptop, local(2024, 7, 1)).accumulatedMinor, 120_000);
check("at the end of life it is fully written down", depreciate(laptop, local(2029, 1, 1)).netBookMinor, 0);
ok("and says so", depreciate(laptop, local(2029, 1, 1)).fullyDepreciated);

// Past the end of its life it must stop, not go negative. This is the one that
// turns a register into a liability if it is wrong.
check("it never depreciates past zero", depreciate(laptop, local(2040, 1, 1)).netBookMinor, 0);
check("and never accrues more than the depreciable amount", depreciate(laptop, local(2040, 1, 1)).accumulatedMinor, 1_200_000);

// A GH₵180,000 minibus, eight years, GH₵20,000 residual.
const bus = {
  costMinor: 18_000_000,
  residualMinor: 2_000_000,
  usefulLifeYears: 8,
  purchasedOn: local(2020, 9, 1),
};

check("residual is excluded from the depreciable amount", depreciate(bus, local(2021, 9, 1)).depreciableMinor, 16_000_000);
check("a year's charge is on the depreciable amount only", depreciate(bus, local(2021, 9, 1)).accumulatedMinor, 2_000_000);
check("net book keeps the residual", depreciate(bus, local(2028, 9, 1)).netBookMinor, 2_000_000);
check("and holds there afterwards", depreciate(bus, local(2035, 9, 1)).netBookMinor, 2_000_000);

// Bought mid-term. A full year's charge here is the classic error.
const projector = {
  costMinor: 450_000,
  residualMinor: 0,
  usefulLifeYears: 3,
  purchasedOn: local(2026, 6, 15),
};
check("a June purchase is not charged a full year in December", depreciate(projector, local(2026, 12, 31)).months, 6);
check("six months of a three-year life", depreciate(projector, local(2026, 12, 15)).accumulatedMinor, 75_000);

// Land, and anything the school chose not to depreciate.
const land = {
  costMinor: 50_000_000,
  residualMinor: 0,
  usefulLifeYears: null,
  purchasedOn: local(2010, 1, 1),
};
ok("no life means not depreciated", depreciate(land, local(2026, 1, 1)).notDepreciated);
check("and it is carried at cost", depreciate(land, local(2026, 1, 1)).netBookMinor, 50_000_000);
check("no accumulated charge", depreciate(land, local(2026, 1, 1)).accumulatedMinor, 0);

// Defensive cases, each of which would otherwise put a wrong figure in a total.
check("no purchase date means no depreciation", depreciate({ ...laptop, purchasedOn: null }, local(2026, 1, 1)).netBookMinor, 1_200_000);
check("a zero life is not a divide by zero", depreciate({ ...laptop, usefulLifeYears: 0 }, local(2026, 1, 1)).netBookMinor, 1_200_000);
check("a negative life is refused too", depreciate({ ...laptop, usefulLifeYears: -5 }, local(2026, 1, 1)).netBookMinor, 1_200_000);
check("a residual above cost cannot raise net book above cost", depreciate({ ...laptop, residualMinor: 9_999_999 }, local(2026, 1, 1)).netBookMinor, 1_200_000);
check("a valuation before purchase charges nothing", depreciate(laptop, local(2020, 1, 1)).accumulatedMinor, 0);
check("a zero-cost asset is harmless", depreciate({ ...laptop, costMinor: 0 }, local(2026, 1, 1)).netBookMinor, 0);

// Cost must always equal accumulated + net book. If rounding ever breaks this
// the register's own columns stop adding up.
for (const months of [1, 7, 13, 29, 41, 59]) {
  const at = addMonths(local(2024, 1, 1), months);
  const value = depreciate(laptop, at);
  check(
    `cost = accumulated + net book at ${months} months`,
    value.accumulatedMinor + value.netBookMinor,
    laptop.costMinor,
  );
}

// An awkward cost that does not divide evenly — rounding once at the end is
// what keeps this exact.
const awkward = {
  costMinor: 100_003,
  residualMinor: 0,
  usefulLifeYears: 3,
  purchasedOn: local(2024, 1, 1),
};
for (const months of [1, 5, 17, 35]) {
  const value = depreciate(awkward, addMonths(local(2024, 1, 1), months));
  check(
    `an indivisible cost still reconciles at ${months} months`,
    value.accumulatedMinor + value.netBookMinor,
    100_003,
  );
}

// -----------------------------------------------------------------------------
// Disposal
// -----------------------------------------------------------------------------

const soldBus = {
  ...bus,
  disposedOn: local(2026, 9, 1),
  disposalProceedsMinor: 800_000,
};

check("depreciation stops on disposal", depreciate(soldBus, local(2030, 1, 1)).months, 72);
const sale = disposalResult(soldBus)!;
check("written down value at disposal", sale.netBookMinor, 6_000_000);
check("proceeds are recorded as given", sale.proceedsMinor, 800_000);
// Sold for less than the books say it was worth: a loss, and it must be negative.
check("a sale below book value is a loss", sale.gainMinor, -5_200_000);

const soldWell = disposalResult({
  ...bus,
  disposedOn: local(2028, 9, 1),
  disposalProceedsMinor: 3_000_000,
})!;
check("a sale above book value is a gain", soldWell.gainMinor, 1_000_000);
check("nothing disposed, nothing to report", disposalResult({ ...bus, disposalProceedsMinor: 0 }), null);

// -----------------------------------------------------------------------------
// Servicing
// -----------------------------------------------------------------------------

const generator = {
  serviceIntervalMonths: 6,
  lastServicedOn: local(2026, 1, 10),
  purchasedOn: local(2024, 1, 1),
  status: "IN_USE" as const,
};

check("due six months after the last service", serviceState(generator, local(2026, 5, 1)).dueOn?.getMonth(), 6);
ok("not overdue before then", !serviceState(generator, local(2026, 5, 1)).overdue);
ok("overdue after", serviceState(generator, local(2026, 8, 1)).overdue);
ok("flagged as due soon inside the window", serviceState(generator, local(2026, 6, 20)).dueSoon);
ok("not flagged as due soon a long way out", !serviceState(generator, local(2026, 3, 1)).dueSoon);

// Never serviced: count from purchase, not "not due". A bus that has never
// been inspected is the one most likely to be overdue.
const neverServiced = { ...generator, lastServicedOn: null };
ok("never serviced counts from purchase", serviceState(neverServiced, local(2026, 1, 1)).overdue);
ok("no interval means nothing is chased", !serviceState({ ...generator, serviceIntervalMonths: null }, local(2030, 1, 1)).overdue);
ok("a disposed asset is not chased for service", !serviceState({ ...generator, status: "DISPOSED" }, local(2030, 1, 1)).overdue);
ok("a written-off asset is not chased either", !serviceState({ ...generator, status: "WRITTEN_OFF" }, local(2030, 1, 1)).overdue);
ok(
  "no dates at all is unknown, not fine",
  serviceState({ ...generator, lastServicedOn: null, purchasedOn: null }, local(2026, 1, 1)).unknown,
);

// -----------------------------------------------------------------------------
// Verification
// -----------------------------------------------------------------------------

ok("never verified is stale from the start", verificationState(null, local(2026, 1, 1)).stale);
ok("and says it has never been seen", verificationState(null, local(2026, 1, 1)).neverVerified);
ok("seen last week is not stale", !verificationState(local(2026, 1, 1), local(2026, 1, 8)).stale);
ok("seen two years ago is", verificationState(local(2024, 1, 1), local(2026, 1, 8)).stale);
check("and reports how long", verificationState(local(2026, 1, 1), local(2026, 1, 11)).days, 10);

// -----------------------------------------------------------------------------
// Status
// -----------------------------------------------------------------------------

ok("in use is held", isHeld("IN_USE"));
// A thing nobody can find has not stopped being the school's.
ok("missing is still held", isHeld("MISSING"));
ok("written off is still held until disposed", isHeld("WRITTEN_OFF"));
ok("disposed is not held", !isHeld("DISPOSED"));
ok("in use is in service", isInService("IN_USE"));
ok("in store is in service", isInService("IN_STORE"));
ok("under repair is not available", !isInService("UNDER_REPAIR"));
ok("missing is not available", !isInService("MISSING"));

check("a status has a label", statusLabel("UNDER_REPAIR"), "Under repair");
check("an unknown status shows as itself", statusLabel("NONSENSE"), "NONSENSE");
check("a condition has a label", conditionLabel("UNSERVICEABLE"), "Unserviceable");

// -----------------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------------

check("a tag reads as a sticker", assetTag("STM", "ICT", 42), "STM/ICT/0042");
check("punctuation and spaces are dropped", assetTag("St Mary's", "I.C.T", 7), "STMARY/ICT/0007");
check("no category falls back to GEN", assetTag("STM", null, 1), "STM/GEN/0001");
check("no prefix falls back to SCH", assetTag("", "ICT", 1), "SCH/ICT/0001");
check("four digits is a floor, not a ceiling", assetTag("STM", "ICT", 123456), "STM/ICT/123456");
check("the sequence reads back", tagSequence("STM/ICT/0042"), 42);
check("a tag with no number reads back as nothing", tagSequence("STM/ICT/"), null);
check("trailing space does not defeat it", tagSequence("STM/ICT/0042  "), 42);

// -----------------------------------------------------------------------------
// Residual from a category percentage
// -----------------------------------------------------------------------------

check("ten per cent of a cost", residualFromPercent(1_200_000, 10), 120_000);
check("zero per cent is zero", residualFromPercent(1_200_000, 0), 0);
check("over a hundred is clamped", residualFromPercent(1_200_000, 150), 1_200_000);
check("negative is clamped", residualFromPercent(1_200_000, -5), 0);

// -----------------------------------------------------------------------------
// The register's totals
// -----------------------------------------------------------------------------

const register = registerTotals(
  [
    { ...laptop, status: "IN_USE", disposalProceedsMinor: 0 },
    { ...bus, status: "IN_USE", disposalProceedsMinor: 0 },
    { ...land, status: "IN_USE", disposalProceedsMinor: 0 },
    { ...laptop, status: "MISSING", disposalProceedsMinor: 0 },
    { ...soldBus, status: "DISPOSED" },
  ],
  local(2026, 1, 1),
);

check("everything is counted", register.count, 5);
check("the disposed one is not held", register.heldCount, 4);
check("and is counted separately", register.disposedCount, 1);
check("missing is visible rather than absorbed", register.missingCount, 1);
// Cost excludes the disposed bus: the school does not own it.
check("cost covers only what is still owned", register.costMinor, 1_200_000 + 18_000_000 + 50_000_000 + 1_200_000);
check("the columns reconcile", register.costMinor - register.accumulatedMinor, register.netBookMinor);
check("the disposal loss is totalled apart", register.disposalGainMinor, -5_200_000);
check("an empty register is all zeroes", registerTotals([], local(2026, 1, 1)).netBookMinor, 0);

// -----------------------------------------------------------------------------
// The catalogues themselves
// -----------------------------------------------------------------------------

ok("every status has a distinct value", new Set(ASSET_STATUSES.map((s) => s.value)).size === ASSET_STATUSES.length);
ok("every condition has a distinct value", new Set(ASSET_CONDITIONS.map((c) => c.value)).size === ASSET_CONDITIONS.length);
ok("every status has a label", ASSET_STATUSES.every((s) => s.label.length > 0));

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} asset checks passed.`);
