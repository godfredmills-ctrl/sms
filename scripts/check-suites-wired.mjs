/**
 * Refuses a build that would skip a test suite nobody remembers exists.
 *
 * There were seventeen files matching scripts/check-*.ts in this project and
 * the build ran eight of them. The other nine — boarding, admissions, exams,
 * the importer, integrations, marks, payroll, markdown and the dashboard —
 * were npm scripts, which is to say they were a habit, and the habit had
 * lapsed months earlier. Three of them had stopped running at all: they import
 * a server-only module and had been dying on their first line since the day
 * that import was added, silently, because nothing invoked them.
 *
 * The comment above the rules loop in build.mjs already says the point of it:
 * these belong in the build rather than in a habit. This guard is what makes
 * that sentence true tomorrow as well as today. Write a new suite, forget to
 * list it, and the build says so.
 *
 * Being itself a check-*.mjs, it is in its own list and has to be wired too,
 * which is a pleasing way to be sure the list is read.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const build = readFileSync(join(root, "scripts", "build.mjs"), "utf8");

const suites = readdirSync(join(root, "scripts"))
  .filter((name) => /^check-.+\.(ts|mjs)$/.test(name))
  .sort();

const missing = suites.filter((name) => !build.includes(`scripts/${name}`));

if (missing.length === 0) {
  console.log(`  ok  All ${suites.length} check suites run in the build.`);
  process.exit(0);
}

console.error("");
console.error("─".repeat(72));
console.error(`  ${missing.length} test suite(s) exist and the build does not run them`);
console.error("─".repeat(72));
console.error("");
for (const name of missing) console.error(`    scripts/${name}`);
console.error("");
console.error("  Add each to a list in scripts/build.mjs: the .mjs guards to the");
console.error("  static-check loop, the .ts rules suites to the one below it. A");
console.error("  suite that only ever runs when somebody remembers it is a suite");
console.error("  that has already stopped running.");
console.error("");
console.error("─".repeat(72));
console.error("");
process.exit(1);
