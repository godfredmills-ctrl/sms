/**
 * Refuses a build whose lock file disagrees with package.json.
 *
 * Deployment ran `npm ci`, which is the one command that insists the two
 * files match. Nothing on a developer machine does: `npm install` quietly
 * reconciles them, `npm run dev` and `npm run build` never look. So the lock
 * file stopped being updated on the sixteenth of August, package.json kept
 * growing until the fifth of September, and in between somebody added PGlite
 * and puppeteer-core to one file and not the other.
 *
 * What that cost: every deploy for thirteen days died on its first command,
 *
 *     npm error `npm ci` can only install packages when your package.json
 *     npm error and package-lock.json are in sync.
 *     npm error Missing: @electric-sql/pglite@0.3.16 from lock file
 *
 * before a line of this project was compiled. Twenty-two commits, nine
 * migrations and seven finished modules sat in the repository, and the live
 * site went on serving the twenty-sixth of August. Nobody was told. The build
 * that mattered was the only one nobody was running.
 *
 * So run the comparison here, where it fails on the machine that caused it,
 * minutes after the change rather than a fortnight later.
 *
 * npm writes the declared ranges verbatim into packages[""] of the lock, so
 * the two are directly comparable — no resolution, no network, no semver.
 * Compared as sorted pairs rather than as text, because the two files order
 * their keys differently and a diff of formatting is not a diff of intent.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));

const FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];
const declared = lock.packages?.[""] ?? {};

/** name@range pairs, sorted, so key order cannot make a false difference. */
const pairs = (block) =>
  Object.entries(block ?? {})
    .map(([name, range]) => `${name}@${range}`)
    .sort();

const problems = [];

for (const field of FIELDS) {
  const wanted = pairs(pkg[field]);
  const locked = pairs(declared[field]);

  for (const entry of wanted) {
    if (!locked.includes(entry)) problems.push(`${field}: ${entry} is not in the lock file`);
  }
  for (const entry of locked) {
    if (!wanted.includes(entry)) problems.push(`${field}: ${entry} is in the lock file only`);
  }
}

// A range can be recorded without the tree ever being resolved, and npm ci
// installs the tree, not the range. Check the package was actually placed.
for (const field of FIELDS) {
  for (const name of Object.keys(pkg[field] ?? {})) {
    if (!lock.packages?.[`node_modules/${name}`]) {
      problems.push(`${field}: ${name} has no resolved entry in the lock file`);
    }
  }
}

if (problems.length === 0) {
  const total = FIELDS.reduce((sum, field) => sum + pairs(pkg[field]).length, 0);
  console.log(`  ok  package-lock.json matches package.json (${total} dependencies).`);
  process.exit(0);
}

console.error("");
console.error("─".repeat(72));
console.error("  package-lock.json does not match package.json");
console.error("─".repeat(72));
console.error("");
for (const problem of problems.slice(0, 20)) console.error(`    ${problem}`);
if (problems.length > 20) console.error(`    ... and ${problems.length - 20} more`);
console.error("");
console.error("  Deployment installs with `npm ci`, which refuses to guess. This");
console.error("  build would install here and fail there, which is how the live");
console.error("  site once stayed thirteen days behind the repository without");
console.error("  anyone being told.");
console.error("");
console.error("  Fix it, and commit the result:");
console.error("");
console.error("      npm install --package-lock-only");
console.error("      git add package-lock.json");
console.error("");
process.exit(1);
