/**
 * Tests for the cafeteria's arithmetic and, mostly, its allergy check.
 *
 * The rota maths gets a fair share of this because "which week of the cycle is
 * it" is the kind of function that is right for a month and then wrong on the
 * first Monday after somebody edits the start date. The larger share goes to
 * the allergy matching, where both failure directions are dangerous in
 * different ways: a miss hands a nut to a child who cannot eat nuts, and a
 * false alarm on every plate teaches the kitchen to click through the warnings
 * until the real one arrives.
 */

import {
  ALLERGENS,
  ALLERGEN_KEYS,
  allergenLabel,
  allergyWarnings,
  absentFromService,
  billingTotalMinor,
  cycleWeekFor,
  dayLabel,
  entitlement,
  isoDay,
  matchAllergen,
  matchAllergens,
  menuGaps,
  menuItemFor,
  needsOverride,
  planCovers,
  serviceTotals,
  severityRank,
  sittingLabel,
  SITTINGS,
  sortSittings,
  subscriptionLiveOn,
  unbilledSubscriptions,
} from "../src/lib/cafeteria-rules";

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

/** Local midnight, which is how every date in this module is compared. */
const on = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

// -----------------------------------------------------------------------------
// Days
// -----------------------------------------------------------------------------

// 2026-08-24 is a Monday.
check("Monday is ISO day 1", isoDay(on("2026-08-24")), 1);
check("Friday is 5", isoDay(on("2026-08-28")), 5);
check("Saturday is 6", isoDay(on("2026-08-29")), 6);
check("Sunday is 7, not 0", isoDay(on("2026-08-30")), 7);
check("and the week starts again", isoDay(on("2026-08-31")), 1);

check("day 1 is Monday", dayLabel(1), "Monday");
check("day 7 is Sunday", dayLabel(7), "Sunday");
check("an unknown day names nothing", dayLabel(9), "");

// -----------------------------------------------------------------------------
// The rota
// -----------------------------------------------------------------------------

const cycleStart = on("2026-08-24"); // a Monday

check("the first Monday is week 1", cycleWeekFor(on("2026-08-24"), cycleStart, 2), 1);
check("so is the Friday after it", cycleWeekFor(on("2026-08-28"), cycleStart, 2), 1);
check("and the Sunday", cycleWeekFor(on("2026-08-30"), cycleStart, 2), 1);
check("the next Monday is week 2", cycleWeekFor(on("2026-08-31"), cycleStart, 2), 2);
check("and it wraps", cycleWeekFor(on("2026-09-07"), cycleStart, 2), 1);
check("a three-week cycle reaches week 3", cycleWeekFor(on("2026-09-07"), cycleStart, 3), 3);
check("then wraps", cycleWeekFor(on("2026-09-14"), cycleStart, 3), 1);
check("a one-week cycle is always week 1", cycleWeekFor(on("2026-11-19"), cycleStart, 1), 1);

// A menu entered as starting mid-week still runs Monday to Sunday, or the
// rota shifts a day every time somebody sets it up on a Wednesday.
check(
  "a Wednesday start still counts from that Monday",
  cycleWeekFor(on("2026-08-28"), on("2026-08-26"), 2),
  1,
);
check(
  "and the following Monday is still week 2",
  cycleWeekFor(on("2026-08-31"), on("2026-08-26"), 2),
  2,
);

// Dates before the menu starts have to have an answer rather than a negative
// week or a crash: the screen shows next term's menu before term begins.
check("a week before the start is week 2 of a 2-week cycle", cycleWeekFor(on("2026-08-17"), cycleStart, 2), 2);
check("two weeks before is week 1 again", cycleWeekFor(on("2026-08-10"), cycleStart, 2), 1);
ok(
  "no date produces a week outside the cycle",
  [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, -1, -7, -30].every((offset) => {
    const date = new Date(cycleStart);
    date.setDate(date.getDate() + offset);
    const week = cycleWeekFor(date, cycleStart, 3);
    return week >= 1 && week <= 3;
  }),
);
check("a nonsense cycle length does not divide by zero", cycleWeekFor(on("2026-09-01"), cycleStart, 0), 1);

const rota = [
  { weekNumber: 1, dayOfWeek: 1, sitting: "LUNCH", dish: "Jollof rice and chicken" },
  { weekNumber: 1, dayOfWeek: 1, sitting: "SUPPER", dish: "Banku and okro stew" },
  { weekNumber: 2, dayOfWeek: 1, sitting: "LUNCH", dish: "Waakye" },
];

const menu = { startsOn: cycleStart, cycleWeeks: 2 };

check(
  "the first Monday's lunch",
  menuItemFor(rota, on("2026-08-24"), menu, "LUNCH")?.dish,
  "Jollof rice and chicken",
);
check(
  "the same day's supper is a different dish",
  menuItemFor(rota, on("2026-08-24"), menu, "SUPPER")?.dish,
  "Banku and okro stew",
);
check(
  "the second Monday's lunch is week 2's",
  menuItemFor(rota, on("2026-08-31"), menu, "LUNCH")?.dish,
  "Waakye",
);
check(
  "and the cycle brings the first back",
  menuItemFor(rota, on("2026-09-07"), menu, "LUNCH")?.dish,
  "Jollof rice and chicken",
);
check("a day the rota is silent about", menuItemFor(rota, on("2026-08-25"), menu, "LUNCH"), null);
check("a sitting it is silent about", menuItemFor(rota, on("2026-08-31"), menu, "SUPPER"), null);

const gaps = menuGaps(rota, 2, ["LUNCH"], [1, 2]);
check("a half-filled rota reports its holes", gaps.length, 2);
check(
  "and names them",
  gaps.map((gap) => `${gap.weekNumber}/${gap.dayOfWeek}`),
  ["1/2", "2/2"],
);
check("a full rota reports none", menuGaps(rota, 2, ["LUNCH"], [1]).length, 0);

// -----------------------------------------------------------------------------
// Sittings
// -----------------------------------------------------------------------------

check("sittings sort into the order of the day", sortSittings(["SUPPER", "BREAKFAST", "LUNCH"]), [
  "BREAKFAST",
  "LUNCH",
  "SUPPER",
]);
check("an unknown sitting sorts last rather than vanishing", sortSittings(["TEA", "LUNCH"]), [
  "LUNCH",
  "TEA",
]);
check("breakfast is named", sittingLabel("BREAKFAST"), "Breakfast");
check("and an unknown one names itself", sittingLabel("TEA"), "TEA");
ok("every sitting has a distinct order", new Set(SITTINGS.map((s) => s.order)).size === SITTINGS.length);

// -----------------------------------------------------------------------------
// Allergen matching
// -----------------------------------------------------------------------------

check("peanut", matchAllergen("peanut"), "PEANUT");
check("plural", matchAllergen("peanuts"), "PEANUT");
check("groundnut is the same allergy", matchAllergen("groundnut"), "PEANUT");
check("and so is nkate", matchAllergen("nkate"), "PEANUT");
check("case does not matter", matchAllergen("GROUNDNUTS"), "PEANUT");
check("punctuation does not matter", matchAllergen("groundnut."), "PEANUT");
check("a sentence still matches", matchAllergen("allergic to groundnut oil"), "PEANUT");
check("shellfish", matchAllergen("prawns"), "SHELLFISH");
check("koobi is fish", matchAllergen("koobi"), "FISH");
check("dairy is milk", matchAllergen("dairy"), "MILK");
check("nothing recognisable", matchAllergen("dust"), null);
check("empty", matchAllergen(""), null);
check("whitespace", matchAllergen("   "), null);

// The false-alarm cases. Each of these would fire on a substring test, and a
// warning that fires on every plate is a warning nobody reads.
check("coconut is not a tree nut", matchAllergen("coconut"), null);
check("hamper is not ham", matchAllergen("hamper"), null);
check("chimney is not a nut", matchAllergen("chimney"), null);
check("eggplant is not egg", matchAllergen("eggplant"), null);
check("buttermilk squash is not butter", matchAllergen("buttermilkless"), null);

check("several in one line", matchAllergens("peanuts and shellfish").sort(), ["PEANUT", "SHELLFISH"]);
check("no duplicates from two synonyms", matchAllergens("groundnut and peanut"), ["PEANUT"]);
check("nothing in a blank line", matchAllergens(""), []);

ok("every allergen key is distinct", new Set(ALLERGEN_KEYS).size === ALLERGEN_KEYS.length);
ok(
  "every allergen matches its own label",
  ALLERGENS.every((entry) => allergenLabel(entry.key) === entry.label),
);
ok(
  "every synonym resolves to its own allergen",
  ALLERGENS.every((entry) => entry.synonyms.every((word) => matchAllergen(word) === entry.key)),
);

// -----------------------------------------------------------------------------
// Severity
// -----------------------------------------------------------------------------

ok("anaphylaxis outranks severe", severityRank("ANAPHYLAXIS") > severityRank("SEVERE"));
ok("severe outranks moderate", severityRank("SEVERE") > severityRank("MODERATE"));
ok("moderate outranks mild", severityRank("MODERATE") > severityRank("MILD"));
check("an unknown severity is the floor", severityRank("SPICY"), 0);
check("so is nothing at all", severityRank(null), 0);

// -----------------------------------------------------------------------------
// The warning
// -----------------------------------------------------------------------------

const peanutAnaphylaxis = [
  {
    name: "Groundnuts",
    severity: "ANAPHYLAXIS",
    reaction: "Throat closes",
    treatment: "EpiPen in the nurse's room",
  },
];

const jollofWithGroundnut = allergyWarnings(peanutAnaphylaxis, null, ["PEANUT"]);
check("the dish is flagged", jollofWithGroundnut.length, 1);
check("named from the list", jollofWithGroundnut[0].label, "Peanut");
check("and shown as the parent wrote it", jollofWithGroundnut[0].recordedAs, "Groundnuts");
check("with the reaction", jollofWithGroundnut[0].reaction, "Throat closes");
check("and the treatment", jollofWithGroundnut[0].treatment, "EpiPen in the nurse's room");
check("anaphylaxis stops the serving", jollofWithGroundnut[0].level, "stop");
ok("so an override is required", needsOverride(jollofWithGroundnut));

check("a dish without it is silent", allergyWarnings(peanutAnaphylaxis, null, ["FISH"]).length, 0);
check("a dish with nothing declared is silent", allergyWarnings(peanutAnaphylaxis, null, []).length, 0);
check("no allergies is silent", allergyWarnings([], null, ["PEANUT"]).length, 0);
check("no record at all is silent", allergyWarnings(null, null, ["PEANUT"]).length, 0);

const mild = allergyWarnings(
  [{ name: "milk", severity: "MILD", reaction: "Stomach ache" }],
  null,
  ["MILK"],
);
check("a mild allergy is a check, not a stop", mild[0].level, "check");
ok("and needs no override", !needsOverride(mild));

const severe = allergyWarnings([{ name: "fish", severity: "SEVERE" }], null, ["FISH"]);
check("severe stops as well as anaphylaxis", severe[0].level, "stop");

const noSeverity = allergyWarnings([{ name: "egg" }], null, ["EGG"]);
check("an allergy with no severity is treated as moderate", noSeverity[0].severity, "MODERATE");
check("and shown rather than dropped", noSeverity.length, 1);
const nonsenseSeverity = allergyWarnings([{ name: "egg", severity: "very bad" }], null, ["EGG"]);
check("as is one with a severity nobody recognises", nonsenseSeverity[0].severity, "MODERATE");

const two = allergyWarnings(
  [
    { name: "milk", severity: "MILD" },
    { name: "peanut", severity: "ANAPHYLAXIS" },
  ],
  null,
  ["MILK", "PEANUT"],
);
check("both are reported", two.length, 2);
check("worst first, because that is the one to read", two[0].label, "Peanut");

const duplicated = allergyWarnings(
  [
    { name: "peanut", severity: "MILD" },
    { name: "groundnut", severity: "SEVERE" },
  ],
  null,
  ["PEANUT"],
);
check("the same allergy written twice warns once", duplicated.length, 1);

const dietary = allergyWarnings(null, "No pork, halal only", ["PORK"]);
check("a dietary restriction is picked up", dietary.length, 1);
check("named", dietary[0].label, "Pork");
check("and is a check rather than a stop", dietary[0].level, "check");
check("a restriction the dish does not touch is silent", allergyWarnings(null, "No pork", ["FISH"]).length, 0);

const both = allergyWarnings([{ name: "pork", severity: "SEVERE" }], "No pork", ["PORK"]);
check("a recorded allergy wins over the free text", both.length, 1);
check("keeping the severity", both[0].level, "stop");

check("an empty allergy name is ignored", allergyWarnings([{ name: "  " }], null, ["PEANUT"]).length, 0);
check(
  "an allergy nothing on the list matches is ignored",
  allergyWarnings([{ name: "pollen", severity: "SEVERE" }], null, ["PEANUT"]).length,
  0,
);
ok("nothing to warn about needs no override", !needsOverride([]));

// -----------------------------------------------------------------------------
// Entitlement
// -----------------------------------------------------------------------------

const lunchOnly = { sittings: ["LUNCH"], priceMinor: 45_000, perMealMinor: 1_500 };
const fullBoard = {
  sittings: ["BREAKFAST", "LUNCH", "SUPPER"],
  priceMinor: 120_000,
  perMealMinor: 1_500,
};

ok("a lunch plan covers lunch", planCovers(lunchOnly, "LUNCH"));
ok("and not supper", !planCovers(lunchOnly, "SUPPER"));
ok("full board covers breakfast", planCovers(fullBoard, "BREAKFAST"));

const live = {
  status: "ACTIVE",
  startsOn: on("2026-09-01"),
  endsOn: on("2026-12-15"),
  plan: lunchOnly,
};

ok("live in the middle of term", subscriptionLiveOn(live, on("2026-10-01")));
ok("live on the first day", subscriptionLiveOn(live, on("2026-09-01")));
ok("live on the last day", subscriptionLiveOn(live, on("2026-12-15")));
ok("not live the day before", !subscriptionLiveOn(live, on("2026-08-31")));
ok("not live the day after", !subscriptionLiveOn(live, on("2026-12-16")));
ok(
  "an open-ended plan runs on",
  subscriptionLiveOn({ ...live, endsOn: null }, on("2027-03-01")),
);
ok("a suspended plan is not live", !subscriptionLiveOn({ ...live, status: "SUSPENDED" }, on("2026-10-01")));
ok("nor an ended one", !subscriptionLiveOn({ ...live, status: "ENDED" }, on("2026-10-01")));

const covered = entitlement(live, "LUNCH", on("2026-10-01"));
ok("lunch is covered", covered.covered);
check("and free at the counter", covered.chargeMinor, 0);
check("recorded against the plan", covered.basis, "PLAN");

const notCovered = entitlement(live, "SUPPER", on("2026-10-01"));
ok("supper is not covered by a lunch plan", !notCovered.covered);
check("but is still served, for cash", notCovered.basis, "CASH");
check("at the plan's per-meal rate", notCovered.chargeMinor, 1_500);
check("and says why", notCovered.note, "Their plan does not include supper");

const suspended = entitlement({ ...live, status: "SUSPENDED" }, "LUNCH", on("2026-10-01"), 2_000);
ok("a suspended plan does not refuse the child", !suspended.covered);
check("it charges", suspended.chargeMinor, 1_500);
check("and says why", suspended.note, "Their plan is suspended");

const none = entitlement(null, "LUNCH", on("2026-10-01"), 2_000);
check("no plan falls back to the school rate", none.chargeMinor, 2_000);
check("and says so", none.note, "No meal plan");

const lapsed = entitlement(live, "LUNCH", on("2027-01-05"), 2_000);
ok("a plan that has run out does not refuse the child either", !lapsed.covered);
check("it charges the school rate", lapsed.chargeMinor, 2_000);

// -----------------------------------------------------------------------------
// Counting
// -----------------------------------------------------------------------------

const served = [
  { basis: "PLAN", chargedMinor: 0, studentId: "s1" },
  { basis: "PLAN", chargedMinor: 0, studentId: "s2" },
  { basis: "CASH", chargedMinor: 1_500, studentId: "s3" },
  { basis: "STAFF", chargedMinor: 1_000, staffId: "t1" },
  { basis: "GUEST", chargedMinor: 2_000 },
];

const totals = serviceTotals(served);
check("everybody counted", totals.served, 5);
check("pupils", totals.students, 3);
check("staff", totals.staff, 1);
check("guests", totals.guests, 1);
check("on a plan", totals.onPlan, 2);
check("paying", totals.paid, 3);
check("takings", totals.takingsMinor, 4_500);

const empty = serviceTotals([]);
check("an empty sitting counts nothing", empty.served, 0);
check("and takes nothing", empty.takingsMinor, 0);

check("two of forty on a plan leaves thirty-eight unaccounted", absentFromService(40, served), 38);
check("nobody missing when everybody came", absentFromService(2, served), 0);
check("more served than expected is not a negative absence", absentFromService(1, served), 0);

// -----------------------------------------------------------------------------
// Billing
// -----------------------------------------------------------------------------

const subscriptions = [
  { status: "ACTIVE", chargedAt: null, plan: { priceMinor: 45_000 } },
  { status: "ACTIVE", chargedAt: new Date(), plan: { priceMinor: 45_000 } },
  { status: "ENDED", chargedAt: null, plan: { priceMinor: 30_000 } },
  { status: "ACTIVE", chargedAt: null, plan: { priceMinor: 0 } },
];

const unbilled = unbilledSubscriptions(subscriptions);
check("already-billed plans are left alone", unbilled.length, 2);
check("including one that ended mid-term, because it was used", unbilled[1].plan.priceMinor, 30_000);
check("a free plan raises nothing", unbilled.every((s) => s.plan.priceMinor > 0), true);
check("the run total is shown before it runs", billingTotalMinor(unbilled), 75_000);
check("an empty run totals nothing", billingTotalMinor([]), 0);

// Running the billing twice in one afternoon must not bill the term twice.
const afterRun = unbilled.map((s) => ({ ...s, chargedAt: new Date() }));
check("a second run finds nothing", unbilledSubscriptions(afterRun).length, 0);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} cafeteria checks passed.`);
