/**
 * Which panels each kind of person sees, and in what order.
 *
 * The dashboard claims to be tailored; this prints what that actually means
 * per role, so a change to the ordering rules shows its consequences rather
 * than being argued about in the abstract, and then asserts the parts of that
 * table that are not a matter of taste: a teacher never sees a payroll figure,
 * a guardian never sees a staff panel, what waits on you comes first.
 *
 *   npx tsx --conditions=react-server scripts/check-dashboard.ts
 *
 * The roles are read out of ROLE_PRESETS rather than written here. They used
 * to be written here, and the copy had drifted: this file believed a teacher
 * did not hold student.medical.read, so "a teacher does not see the clinic"
 * passed while every teacher in the school was in fact being shown the day at
 * the san, the children named. A fixture that approximates the thing under
 * test is a fixture that agrees with itself.
 */
import { panelsFor, roleSummaryFor } from "../src/lib/dashboard";
import { PERMISSIONS, ROLE_PRESETS } from "../src/lib/rbac";

const EVERY = PERMISSIONS.map((permission) => permission.key);

/** The permissions a shipped role actually grants. */
function presetPermissions(key: string): string[] {
  const preset = ROLE_PRESETS.find((entry) => entry.key === key);
  if (!preset) throw new Error(`No such role preset: ${key}`);
  return preset.permissions === "*" ? EVERY : preset.permissions;
}

const ROLES: Record<string, string[]> = Object.fromEntries(
  [
    ["form teacher", "form_teacher"],
    ["teacher", "teacher"],
    ["bursar", "bursar"],
    ["head teacher", "head_teacher"],
    ["nurse", "nurse"],
    ["registrar", "registrar"],
    ["house parent", "house_parent"],
  ].map(([label, key]) => [label, presetPermissions(key)]),
);

// -----------------------------------------------------------------------------
// The report
// -----------------------------------------------------------------------------

const seen: Record<string, string[]> = {};

for (const [role, permissions] of Object.entries(ROLES)) {
  const viewer = { staffId: "staff_1", permissions: new Set(permissions) };
  seen[role] = panelsFor(viewer);
  console.log(
    role.padEnd(14),
    (roleSummaryFor(viewer) ?? "-").padEnd(18),
    seen[role].join(" > "),
  );
}

// A guardian has no staff record: the personal staff panels must vanish.
const guardian = { staffId: null, permissions: new Set(["communication.message"]) };
seen.guardian = panelsFor(guardian);
console.log("guardian".padEnd(14), "-".padEnd(18), seen.guardian.join(" > ") || "(none)");

// -----------------------------------------------------------------------------
// What the report is not allowed to say
//
// Printing the table was the whole of this file, which meant it could never
// fail, which meant that once it was in the build it protected nothing. What
// follows are the things that would be wrong if they changed: not the exact
// list, which is meant to be edited, but the rules the list is an expression
// of. A panel that leaks a payroll figure onto a teacher screen is a bug that
// looks like a layout tweak in a diff.
// -----------------------------------------------------------------------------

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

const has = (role: string, panel: string) => seen[role]!.includes(panel);

// Everybody signed in gets somewhere to start and something coming up.
for (const role of Object.keys(ROLES)) {
  ok(`${role} has a day`, has(role, "myDay"));
  ok(`${role} has what is coming up`, has(role, "comingUp"));
}

// Money. The panel names a figure, so the rule is not "roughly finance
// people": it is exactly the two dashboard permissions that exist to gate it.
ok("the bursar sees the money", has("bursar", "moneyToday"));
ok("the head sees the school", has("head teacher", "schoolPulse"));
ok("a teacher does not see the money", !has("teacher", "moneyToday"));
ok("a form teacher does not either", !has("form teacher", "moneyToday"));
ok("nor does the nurse", !has("nurse", "moneyToday"));
// The registrar holds finance.read: a place is not offered until the entrance
// fee is settled, and that is their question to answer. It follows that the
// money panel is theirs, and this test says so rather than assuming otherwise.
ok("the registrar does see it, holding finance.read", has("registrar", "moneyToday"));
ok("a teacher does not see the school pulse", !has("teacher", "schoolPulse"));
ok("a teacher does not see payroll", !has("teacher", "payrollStatus"));
ok("the nurse does not see payroll", !has("nurse", "payrollStatus"));

// The clinic panel carries medical detail about named children.
/*
 * The clinic day-book: the whole school day at the san, children named.
 *
 * The panel used to ask only for student.medical.read, which every teacher
 * holds so that an allergy shows on their own class list. It drew the panel
 * for all of them and nothing errored. It now reads the same gate the clinic
 * page enforces, and these are the four assertions that say so.
 */
ok("the nurse sees the clinic", has("nurse", "clinicToday"));
ok("so does the office", has("registrar", "clinicToday"));
ok("a teacher does not", !has("teacher", "clinicToday"));
ok("nor a form teacher", !has("form teacher", "clinicToday"));
ok("the bursar does not", !has("bursar", "clinicToday"));

/*
 * A house parent gets the personal panels and nothing of the school.
 *
 * Their boarders reach them through the pupil, one child at a time, which is
 * the right shape for a question at ten at night. A school-wide panel is not.
 */
ok("a house parent has no clinic panel", !has("house parent", "clinicToday"));
ok("no money panel", !has("house parent", "moneyToday"));
ok("no school pulse", !has("house parent", "schoolPulse"));
ok("and no payroll", !has("house parent", "payrollStatus"));

// A guardian is not staff. Every personal staff panel has to vanish, and the
// test is written as a whole-list assertion rather than a handful of nots, so
// a panel added later without needsStaff shows up here rather than on a
// parent screen.
check("a guardian sees only what is not staff work", seen.guardian, [
  "approvals",
  "comingUp",
]);
ok("a guardian has no day of their own", !has("guardian", "myDay"));
ok("a guardian has no pay slip", !has("guardian", "myPay"));

// Order. The dashboard is read from the top, so what waits on the viewer has
// to come before what merely informs them.
const head = seen["head teacher"]!;
ok(
  "what waits on the head comes before the school at large",
  head.indexOf("approvals") < head.indexOf("schoolPulse"),
);
ok(
  "and the school comes before the long tail",
  head.indexOf("schoolPulse") < head.indexOf("comingUp"),
);

// The summary line under the greeting.
check("the head is told it is their school", roleSummaryFor({ staffId: "s", permissions: new Set(["dashboard.management"]) }), "Your school today");
check("a teacher gets their day", roleSummaryFor({ staffId: "s", permissions: new Set(["attendance.take"]) }), "Your day");
check("somebody with nothing gets no line", roleSummaryFor({ staffId: "s", permissions: new Set(["communication.message"]) }), null);

// No duplicates, ever. A panel drawn twice is a rendering key collision as
// well as a nonsense.
for (const [role, panels] of Object.entries(seen)) {
  ok(`${role} sees no panel twice`, new Set(panels).size === panels.length);
}

console.log("");

if (failures.length) {
  console.error(`  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    x ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} dashboard checks passed.`);
