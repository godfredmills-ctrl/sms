/**
 * Tests for the alumni register's arithmetic.
 *
 * Most of these are about the difference between a name on a list and somebody
 * the school can actually write to. That difference is where an alumni module
 * either earns its place or becomes a spreadsheet with a login, and it is
 * exactly the number that gets rounded up when a dashboard wants to look busy.
 */

import {
  ENGAGEMENTS,
  ENGAGEMENT_VALUES,
  REUNION_YEARS,
  VERIFY_AFTER_DAYS,
  carriesMoney,
  cohortLabel,
  cohortsDueAReunion,
  donationTotals,
  engagementLabel,
  engagementScore,
  graduationYearFor,
  leaversToRegister,
  reachability,
  registerHealth,
  yearsSince,
} from "../src/lib/alumni-rules";

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

const on = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** A fixed "today", so nothing here goes stale on the first of January. */
const NOW = on("2026-08-28");

const daysBack = (days: number) => {
  const date = new Date(NOW);
  date.setDate(date.getDate() - days);
  return date;
};

// -----------------------------------------------------------------------------
// Cohorts
// -----------------------------------------------------------------------------

check("a cohort is named the way a reunion is", cohortLabel(2018), "Class of 2018");
check("eight years since 2018", yearsSince(2018, NOW), 8);
check("this year's leavers left zero years ago", yearsSince(2026, NOW), 0);
check("a future year does not read as negative", yearsSince(2030, NOW), 0);

const due = cohortsDueAReunion([2021, 2016, 2020, 2006, 2001, 1976], NOW);
check("five, ten, twenty, twenty-five and fifty are reunions", due.length, 5);
check(
  "and are listed newest cohort first",
  due.map((entry) => entry.year),
  [2021, 2016, 2006, 2001, 1976],
);
check("with the milestone named", due[0].milestone, 5);
check("2020 is not a reunion year, it is a birthday", due.some((e) => e.year === 2020), false);
check("nothing due when nothing is due", cohortsDueAReunion([2019, 2022], NOW).length, 0);
check("a cohort listed twice is counted once", cohortsDueAReunion([2021, 2021], NOW).length, 1);
ok("every reunion year is distinct", new Set(REUNION_YEARS).size === REUNION_YEARS.length);

// A Ghanaian school year runs September to July.
check("June is the year that ends", graduationYearFor(on("2026-06-30")), 2026);
check("July is still that year", graduationYearFor(on("2026-07-25")), 2026);
check("August belongs to the next one", graduationYearFor(on("2026-08-15")), 2027);
check("so does October", graduationYearFor(on("2026-10-01")), 2027);
check("and December", graduationYearFor(on("2026-12-20")), 2027);
check("January is the year that ends", graduationYearFor(on("2027-01-10")), 2027);

// -----------------------------------------------------------------------------
// Reachability
// -----------------------------------------------------------------------------

const base = {
  email: "ama@example.com",
  phone: "0244123456",
  whatsapp: null,
  consentToContact: true,
  consentAt: on("2025-06-01"),
  verifiedAt: daysBack(30),
  deceasedOn: null,
};

const good = reachability(base, NOW);
ok("consented, contactable and recently checked", good.reachable);
check("and says so", good.reason, "Reachable");
check("with the age of the details", good.ageDays, 30);
ok("not stale", !good.stale);

const noConsent = reachability({ ...base, consentToContact: false, consentAt: null }, NOW);
ok("no consent means no contact", !noConsent.mayContact);
ok("however good the details are", !noConsent.reachable);
check("and says why", noConsent.reason, "Has not agreed to be contacted");
ok("the channel is still reported", noConsent.hasChannel);

// The database refuses this pair, but an import could still produce it.
const undatedConsent = reachability({ ...base, consentAt: null }, NOW);
ok("consent with no date is not consent", !undatedConsent.mayContact);
check(
  "and the reason names the problem",
  undatedConsent.reason,
  "Consent recorded with no date, so it cannot be evidenced",
);

const noChannel = reachability(
  { ...base, email: null, phone: null, whatsapp: null },
  NOW,
);
ok("consent with nothing to write to is not reachable", !noChannel.reachable);
ok("but consent is still recorded", noChannel.mayContact);
check("and says what is missing", noChannel.reason, "No email, phone or WhatsApp on file");

ok(
  "WhatsApp alone is a channel",
  reachability({ ...base, email: null, phone: null, whatsapp: "0244123456" }, NOW).hasChannel,
);

const justInside = reachability({ ...base, verifiedAt: daysBack(VERIFY_AFTER_DAYS - 1) }, NOW);
ok("a day inside the window is still trusted", justInside.reachable);
const justOutside = reachability({ ...base, verifiedAt: daysBack(VERIFY_AFTER_DAYS + 1) }, NOW);
ok("a day outside it is not", !justOutside.reachable);
ok("and is marked stale rather than wrong", justOutside.stale);
ok("consent survives staleness", justOutside.mayContact);

const neverChecked = reachability({ ...base, verifiedAt: null }, NOW);
ok("details never confirmed are not trusted", !neverChecked.reachable);
check("and the age is unknown rather than zero", neverChecked.ageDays, null);
check(
  "which is a different sentence from an old one",
  neverChecked.reason,
  "Contact details have never been confirmed",
);

const deceased = reachability({ ...base, deceasedOn: on("2024-03-02") }, NOW);
ok("the school does not write to the dead", !deceased.mayContact);
check("and that is the first thing said", deceased.reason, "Recorded as deceased");
ok("even with consent and fresh details", !deceased.reachable);

// -----------------------------------------------------------------------------
// What the register is worth
// -----------------------------------------------------------------------------

const register = [
  base,
  { ...base, verifiedAt: daysBack(1200) },
  { ...base, consentToContact: false, consentAt: null },
  { ...base, consentToContact: false, consentAt: null },
  { ...base, email: null, phone: null, whatsapp: null },
  { ...base, deceasedOn: on("2023-01-01") },
];

const health = registerHealth(register, NOW);
check("everybody counted", health.total, 6);
check("actually reachable", health.reachable, 1);
check("consented but out of date", health.stale, 1);
check("never agreed", health.noConsent, 2);
check("agreed with nowhere to write", health.noChannel, 1);
check("deceased", health.deceased, 1);
check(
  "and the parts add up to the whole",
  health.reachable + health.stale + health.noConsent + health.noChannel + health.deceased,
  health.total,
);

const emptyRegister = registerHealth([], NOW);
check("an empty register is empty", emptyRegister.total, 0);
check("and reaches nobody", emptyRegister.reachable, 0);

// -----------------------------------------------------------------------------
// Engagement
// -----------------------------------------------------------------------------

ok("every engagement value is distinct", new Set(ENGAGEMENT_VALUES).size === ENGAGEMENT_VALUES.length);
ok(
  "every engagement names itself",
  ENGAGEMENTS.every((entry) => engagementLabel(entry.value) === entry.label),
);
check("an unknown kind names itself", engagementLabel("GIFT"), "GIFT");

ok("only a donation carries money", carriesMoney("DONATION"));
ok("mentoring does not", !carriesMoney("MENTORING"));
ok("nor an event", !carriesMoney("EVENT"));

const recentMentoring = engagementScore(
  [{ kind: "MENTORING", happenedOn: daysBack(30), amountMinor: 0 }],
  NOW,
);
const oldDinner = engagementScore(
  [{ kind: "EVENT", happenedOn: daysBack(365 * 4), amountMinor: 0 }],
  NOW,
);
ok("mentoring last term beats a dinner four years ago", recentMentoring > oldDinner);

check("nothing scores nothing", engagementScore([], NOW), 0);
check(
  "something six years old has decayed to nothing",
  engagementScore([{ kind: "DONATION", happenedOn: daysBack(365 * 6), amountMinor: 500_000 }], NOW),
  0,
);
ok(
  "and never goes negative",
  engagementScore([{ kind: "DONATION", happenedOn: daysBack(365 * 20), amountMinor: 1 }], NOW) >= 0,
);

const small = engagementScore(
  [{ kind: "DONATION", happenedOn: daysBack(10), amountMinor: 1_000 }],
  NOW,
);
const large = engagementScore(
  [{ kind: "DONATION", happenedOn: daysBack(10), amountMinor: 50_000_000 }],
  NOW,
);
check("the size of a donation does not change the score", small, large);

const several = engagementScore(
  [
    { kind: "DONATION", happenedOn: daysBack(10), amountMinor: 100_000 },
    { kind: "MENTORING", happenedOn: daysBack(10), amountMinor: 0 },
  ],
  NOW,
);
ok("several acts score more than one", several > small);

// -----------------------------------------------------------------------------
// Donations
// -----------------------------------------------------------------------------

const mixed = [
  { kind: "DONATION", happenedOn: daysBack(10), amountMinor: 500_000, alumnusId: "a1" },
  { kind: "DONATION", happenedOn: daysBack(40), amountMinor: 250_000, alumnusId: "a1" },
  { kind: "DONATION", happenedOn: daysBack(90), amountMinor: 1_000_000, alumnusId: "a2" },
  { kind: "MENTORING", happenedOn: daysBack(5), amountMinor: 0, alumnusId: "a3" },
  { kind: "EVENT", happenedOn: daysBack(5), amountMinor: 0, alumnusId: "a4" },
];

const totals = donationTotals(mixed);
check("only donations are counted", totals.count, 3);
check("summed", totals.totalMinor, 1_750_000);
check("the largest single gift", totals.largestMinor, 1_000_000);
check("two gifts from one person is one donor", totals.donors, 2);

const noDonations = donationTotals([
  { kind: "EVENT", happenedOn: daysBack(5), amountMinor: 0, alumnusId: "a1" },
]);
check("no donations totals nothing", noDonations.totalMinor, 0);
check("and has no donors", noDonations.donors, 0);
check("an empty list is safe", donationTotals([]).count, 0);

// -----------------------------------------------------------------------------
// Bringing leavers forward
// -----------------------------------------------------------------------------

const leavers = [
  { id: "s1", status: "GRADUATED", hasAlumnusRecord: false },
  { id: "s2", status: "GRADUATED", hasAlumnusRecord: true },
  { id: "s3", status: "ALUMNI", hasAlumnusRecord: false },
  { id: "s4", status: "TRANSFERRED_OUT", hasAlumnusRecord: false },
  { id: "s5", status: "WITHDRAWN", hasAlumnusRecord: false },
  { id: "s6", status: "ENROLLED", hasAlumnusRecord: false },
];

const toRegister = leaversToRegister(leavers);
check("graduates and alumni, not yet on the register", toRegister.length, 2);
check("named", toRegister.map((leaver) => leaver.id), ["s1", "s3"]);
check("somebody already on it is left alone", toRegister.some((l) => l.id === "s2"), false);
check("a transfer out is not an old boy of this school", toRegister.some((l) => l.id === "s4"), false);
check("nor is a withdrawal", toRegister.some((l) => l.id === "s5"), false);
check("and a current pupil certainly is not", toRegister.some((l) => l.id === "s6"), false);
check("running it twice finds nothing new", leaversToRegister(
  leavers.map((leaver) => ({ ...leaver, hasAlumnusRecord: true })),
).length, 0);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} alumni checks passed.`);
