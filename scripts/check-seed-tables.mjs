/**
 * Refuses a build in which the seed's reset() does not clear every model.
 *
 * prisma/seed.ts wipes the database from a hand-written list of tables, in an
 * order that respects the foreign keys. It already guards itself: it diffs
 * that list against the Prisma client's delegates and exits rather than
 * seeding into rows it failed to clear. That guard is well written and it
 * works — but it only runs when someone runs the seed, and it needs a
 * database to run against.
 *
 * So a model added without a matching entry sat in the repo, built clean,
 * deployed clean, and turned up as a developer cloning the project and
 * getting "1 table(s) are not cleared by reset(): visitor" and no database
 * at all. The list and the schema are both files; the answer is knowable at
 * build time and does not need Postgres to be reachable.
 *
 * Prisma's delegate names are the model name with a lowercase first letter,
 * which is the whole of the mapping being reproduced here.
 */

import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(
  (match) => match[1][0].toLowerCase() + match[1].slice(1),
);

const seed = readFileSync("prisma/seed.ts", "utf8");
const start = seed.indexOf("const tables: Array<keyof PrismaClient> = [");

if (start < 0) {
  console.error("\n  Could not find reset()'s table list in prisma/seed.ts.");
  console.error("  If it was renamed, update scripts/check-seed-tables.mjs to match.\n");
  process.exit(1);
}

const block = seed.slice(start, seed.indexOf("];", start));
const listed = new Set([...block.matchAll(/"(\w+)"/g)].map((match) => match[1]));

const missing = models.filter((name) => !listed.has(name));
const unknown = [...listed].filter((name) => !models.includes(name));

if (missing.length === 0 && unknown.length === 0) {
  console.log(`  ok  reset() clears every model (${models.length}).`);
  process.exit(0);
}

const rule = "─".repeat(72);
console.error(`\n${rule}`);
console.error("  prisma/seed.ts reset() does not match the schema");
console.error(rule);

if (missing.length) {
  console.error("\n  Models the wipe would leave behind: the seed will refuse to run:\n");
  for (const name of missing) console.error(`    ${name}`);
  console.error(
    "\n  Add each to the `tables` list, positioned so its rows go before the",
  );
  console.error("  rows it points at.");
}

if (unknown.length) {
  console.error("\n  Named in the list but not a model: a rename or a typo:\n");
  for (const name of unknown) console.error(`    ${name}`);
}

console.error(`\n${rule}\n`);
process.exit(1);
