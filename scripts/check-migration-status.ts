/**
 * Tests for the migration comparison behind /api/health.
 *
 * These exist because the check they replace passed while being wrong. It
 * counted tables in the public schema, found 156, and reported
 * "migrations":"applied" against a database that was seventeen tables short of
 * the schema the running code expected. Nothing errored. The endpoint whose
 * only job is to notice that condition reported green.
 *
 * So the cases below are mostly about what the function says when it CANNOT
 * see something, because that is where the old one went wrong: a check with a
 * missing input must not report agreement.
 */

import {
  migrationStatus,
  type MigrationRow,
} from "../src/lib/migration-status";

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

/** A migration that applied cleanly. */
const done = (name: string): MigrationRow => ({
  name,
  finished: true,
  rolledBack: false,
});

/** A migration that started and never finished. */
const stuck = (name: string): MigrationRow => ({
  name,
  finished: false,
  rolledBack: false,
});

const NINE = [
  "20260908000000_guardian_status",
  "20260909000000_cafeteria",
  "20260910000000_alumni",
  "20260911000000_timetabling",
  "20260912000000_lesson_notes",
  "20260913000000_cover",
  "20260914000000_requisitions",
  "20260915000000_appraisals",
  "20260916000000_monthly_billing",
];
const OLD = ["00000000000000_init", "20260902000000_admissions"];
const ALL = [...OLD, ...NINE];

// -----------------------------------------------------------------------------
// Agreement
// -----------------------------------------------------------------------------

const matched = migrationStatus({ onDisk: ALL, rows: ALL.map(done) });
check("everything applied is applied", matched.state, "applied");
ok("and healthy", matched.healthy);
check("with nothing pending", matched.pending, []);
check("and the applied count is the real one", matched.applied, 11);
ok("and no hint is offered when there is nothing to say", !matched.hint);

check(
  "an empty database with an empty image agrees too",
  migrationStatus({ onDisk: [], rows: [] }).state,
  "applied",
);

// -----------------------------------------------------------------------------
// The case that was reported as healthy and was not
// -----------------------------------------------------------------------------

const behind = migrationStatus({ onDisk: ALL, rows: OLD.map(done) });
check("a database behind the code is pending", behind.state, "pending");
ok("and is not healthy", !behind.healthy);
check("and names every missing migration", behind.pending, NINE);
check("and counts what it does have", behind.applied, 2);
ok(
  "and the hint says how many, so the number is checkable",
  String(behind.hint).includes("9 migrations have"),
);
ok(
  "and points at migrate deploy, not db push",
  String(behind.hint).includes("prisma migrate deploy") &&
    !String(behind.hint).includes("db push"),
);

check(
  "one missing migration is described in the singular",
  String(
    migrationStatus({ onDisk: ALL, rows: ALL.slice(0, -1).map(done) }).hint,
  ).includes("One migration has"),
  true,
);

// -----------------------------------------------------------------------------
// Missing inputs are never agreement
// -----------------------------------------------------------------------------

const virgin = migrationStatus({ onDisk: ALL, rows: null });
check("no history table at all is pending", virgin.state, "pending");
ok("and is not healthy", !virgin.healthy);
check("and every migration counts as pending", virgin.pending, ALL);
check("and nothing is claimed as applied", virgin.applied, 0);

const blind = migrationStatus({ onDisk: null, rows: ALL.map(done) });
check("an unreadable migrations directory is unverified", blind.state, "unverified");
check(
  "and is NOT reported as applied, which is the whole point",
  blind.state === "applied",
  false,
);
ok("but does not fail the deployment either", blind.healthy);
check("and reports the count without vouching for it", blind.applied, 11);
ok("and says the comparison did not happen", String(blind.hint).includes("cannot be compared"));

check(
  "an empty database and an unreadable directory is still pending, not unverified",
  migrationStatus({ onDisk: null, rows: null }).state,
  "pending",
);

// -----------------------------------------------------------------------------
// Half-applied
// -----------------------------------------------------------------------------

const halfway = migrationStatus({
  onDisk: ALL,
  rows: [...OLD.map(done), stuck("20260908000000_guardian_status")],
});
check("a migration that never finished is failed", halfway.state, "failed");
ok("and is not healthy", !halfway.healthy);
check("and is named", halfway.failed, ["20260908000000_guardian_status"]);
ok("and is not counted among the applied", halfway.applied === 2);
ok(
  "and is listed as pending too, because half applied is not applied",
  halfway.pending.includes("20260908000000_guardian_status"),
);

const rolledBack = migrationStatus({
  onDisk: ALL,
  rows: [...OLD.map(done), { name: NINE[0], finished: true, rolledBack: true }],
});
check("a rolled-back migration is failed too", rolledBack.state, "failed");
ok(
  "and it goes back on the pending list, because it is not applied",
  rolledBack.pending.includes(NINE[0]),
);

ok(
  "failure is reported ahead of pending, because the history cannot be trusted",
  migrationStatus({ onDisk: ALL, rows: [...OLD.map(done), stuck(NINE[0])] }).state ===
    "failed",
);

// -----------------------------------------------------------------------------
// Ahead: a deploy in flight, not a fault
// -----------------------------------------------------------------------------

const ahead = migrationStatus({ onDisk: OLD, rows: ALL.map(done) });
check("a database ahead of the image is still applied", ahead.state, "applied");
ok("and healthy, because these migrations are additive", ahead.healthy);
check("and the extra migrations are named", ahead.ahead, NINE);
ok(
  "and it is described as a deploy, not an error",
  String(ahead.hint).includes("newer deployment"),
);

ok(
  "being behind AND ahead still reports behind, because that is what breaks pages",
  migrationStatus({
    onDisk: [...OLD, "20260917000000_future"],
    rows: ALL.map(done),
  }).state === "pending",
);

// -----------------------------------------------------------------------------
// Order does not matter to the comparison
// -----------------------------------------------------------------------------

ok(
  "the history is compared as a set, not a sequence",
  migrationStatus({ onDisk: ALL, rows: [...ALL].reverse().map(done) }).state ===
    "applied",
);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    x ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} migration status checks passed.`);
