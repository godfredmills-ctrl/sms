/**
 * Production build entrypoint.
 *
 * Does three things before handing over to Next:
 *
 * 1. Reports the raw NODE_ENV, so a bad value is visible in the build log
 *    rather than inferred from a downstream symptom.
 * 2. Normalises NODE_ENV, since Next only accepts development|production|test
 *    and a value pasted from a dashboard can arrive quoted.
 * 3. Clears the previous build output, including the contents of .next/cache.
 *
 * Point 3 is the important one. Hosts mount .next/cache as a volume that
 * survives between builds. When a cached chunk disagrees with the current
 * compile, prerendering the framework's internal /404 and /_error pages fails
 * with:
 *
 *     <Html> should not be imported outside of pages/_document
 *
 * which names a file nobody wrote and points at Next internals. It is not
 * reproducible from a clean checkout, so it looks like a code fault when it is
 * really a stale artifact. Correctness of every deploy is worth more than the
 * few seconds an incremental cache saves; set KEEP_NEXT_CACHE=true to opt out.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { binOf, normaliseNodeEnv } from "./env.mjs";

// -----------------------------------------------------------------------------
// 1 & 2. Environment
// -----------------------------------------------------------------------------

console.log(`\n  NODE_ENV as received: ${JSON.stringify(process.env.NODE_ENV)}`);
normaliseNodeEnv({ fallback: "production" });
console.log(`  NODE_ENV in use:      ${JSON.stringify(process.env.NODE_ENV)}`);

// -----------------------------------------------------------------------------
// 3. Clear stale build output
// -----------------------------------------------------------------------------

/**
 * Empties a directory without removing it. `.next/cache` is a mount point on
 * hosted builders — unlinking it fails with EBUSY, so its children go instead.
 */
function emptyDir(dir) {
  let removed = 0;
  for (const entry of readdirSync(dir)) {
    const target = join(dir, entry);
    try {
      rmSync(target, { recursive: true, force: true });
      removed += 1;
    } catch {
      // A mount point cannot be unlinked; clear what is inside it instead.
      try {
        if (statSync(target).isDirectory()) removed += emptyDir(target);
      } catch {
        // Genuinely undeletable — leave it and carry on.
      }
    }
  }
  return removed;
}

if (process.env.KEEP_NEXT_CACHE === "true") {
  console.log("  Build cache kept (KEEP_NEXT_CACHE=true).\n");
} else if (existsSync(".next")) {
  const removed = emptyDir(".next");
  console.log(`  Cleared previous build output (${removed} entries).\n`);
} else {
  console.log("  No previous build output to clear.\n");
}

// -----------------------------------------------------------------------------
// Build
// -----------------------------------------------------------------------------

function run(label, bin, args) {
  console.log(`\n  ${label}\n`);
  const result = spawnSync(process.execPath, [bin, ...args], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`\n  ${label} failed (exit code ${result.status}).\n`);
    process.exit(result.status ?? 1);
  }
}

// Cheap, and it catches a class of defect `next build` does not: a "use
// server" module exporting a value rather than an async function compiles,
// type-checks and builds clean, then 500s the first time the page is opened.
for (const check of [
  // First, because it is the one that decides whether anything reaches the
  // server at all. A lock file out of step with package.json builds perfectly
  // here and dies on `npm ci` there, before a line is compiled.
  ["the lock file matches package.json", "scripts/check-lockfile.mjs"],
  ["server-action exports", "scripts/check-server-exports.mjs"],
  ["internal links", "scripts/check-internal-links.mjs"],
  ["PDF text sanitising", "scripts/check-pdf-text.mjs"],
  ["seed coverage", "scripts/check-seed-tables.mjs"],
  ["unreachable actions", "scripts/check-dead-actions.mjs"],
  ["script conditions", "scripts/check-script-conditions.mjs"],
  ["integration reads", "scripts/check-integration-reads.mjs"],
  ["printed register fits", "scripts/check-register-fit.mjs"],
  ["house style dashes", "scripts/check-dashes.mjs"],
  ["guardian contact filters", "scripts/check-guardian-contact.mjs"],
  ["portal query scope", "scripts/check-portal-scope.mjs"],
  // Last of the static guards, because it reads this file and should read it
  // in the state the rest of the build agrees with.
  ["every suite is wired in", "scripts/check-suites-wired.mjs"],
]) {
  run(`Checking ${check[0]}`, check[1], []);
}

/**
 * The rules tests, which used to be npm scripts nobody remembered to run.
 *
 * Each of these covers a module of pure arithmetic: depreciation, stock
 * valuation, double-entry, the cafeteria's rota and allergy matching. They
 * take about a second between them and they are the only thing standing
 * between a refactor and a silently wrong balance sheet, so they belong in
 * the build rather than in a habit.
 *
 * The habit duly lapsed. Nine of these existed and were not listed here, and
 * three had been dying on their first import for months without anybody
 * hearing about it, because nothing ran them. check-suites-wired.mjs above now
 * refuses a build that leaves one out.
 *
 * Every one runs with --conditions=react-server. A suite that reaches a module
 * marked server-only otherwise resolves it to a file whose whole body is a
 * throw, and the failure reads as a broken test rather than a missing flag.
 * Passing it to all of them is one fewer decision to get wrong.
 */
for (const check of [
  ["asset rules", "scripts/check-assets.ts"],
  ["stock rules", "scripts/check-stock.ts"],
  ["ledger rules", "scripts/check-ledger.ts"],
  ["cafeteria rules", "scripts/check-cafeteria.ts"],
  ["alumni rules", "scripts/check-alumni.ts"],
  ["timetable rules", "scripts/check-timetable.ts"],
  ["lesson note rules", "scripts/check-lesson-notes.ts"],
  ["cover rules", "scripts/check-cover.ts"],
  ["requisition rules", "scripts/check-requisitions.ts"],
  ["appraisal rules", "scripts/check-appraisals.ts"],
  ["board report rules", "scripts/check-board-report.ts"],
  ["billing cycle", "scripts/check-billing-cycle.ts"],
  ["migration status", "scripts/check-migration-status.ts"],
  ["reading a school register", "scripts/check-school-import.ts"],
  ["staff attendance", "scripts/check-staff-attendance.ts"],
  ["boarding rules", "scripts/check-boarding.ts"],
  ["admission rules", "scripts/check-admissions.ts"],
  ["examination rules", "scripts/check-exams.ts"],
  ["mark entry", "scripts/check-marks.ts"],
  ["payroll arithmetic", "scripts/check-payroll.ts"],
  ["the importer", "scripts/check-import.ts"],
  ["integration settings", "scripts/check-integrations.ts"],
  ["markdown rendering", "scripts/check-markdown.ts"],
  ["dashboard panels", "scripts/check-dashboard.ts"],
]) {
  run(`Checking ${check[0]}`, await binOf("tsx/cli"), [
    "--conditions=react-server",
    check[1],
  ]);
}

run("Generating Prisma client", await binOf("prisma/build/index.js"), ["generate"]);
run("Building Next.js application", await binOf("next/dist/bin/next"), ["build"]);
