/**
 * Guard: every portal query is scoped to the person looking at it.
 *
 * The guardian portal is the one place in this system where the viewer is not
 * staff and the data is somebody's child. Every page there answers the same
 * question — my children, my fees, my attendance — and every one of them does
 * it by constraining on the wards of the signed-in guardian. Nineteen queries
 * across a dozen files, written over months.
 *
 * Forget the constraint on the twentieth and nothing errors. The page renders,
 * the layout is right, the query is valid, and a parent is looking at another
 * family's balance. There is no exception to catch and no test that fails,
 * because the code is doing exactly what it says; it just does not say enough.
 *
 * So: a Prisma call under portal/guardian or portal/student must mention the
 * viewer somewhere in its arguments. studentId, guardianId, wardIds, userId —
 * the names the scope actually travels under. A query that is genuinely the
 * same for everybody says so on the line above:
 *
 *   // portal-scope: the school calendar is one calendar
 *   db.calendarEvent.findMany({ ... })
 *
 * which is a decision somebody made rather than a line somebody forgot.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

const PORTALS = [
  join("src", "app", "(app)", "portal", "guardian"),
  join("src", "app", "(app)", "portal", "student"),
];

/** Reads that could carry another family's data if left unconstrained. */
const OPERATIONS = [
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
];

/**
 * The names the viewer's own identity travels under.
 *
 * Deliberately a list of identifiers rather than a shape: the guard is asking
 * whether the query mentions the viewer at all, not whether it mentions them
 * correctly. Reviewing the shape is a person's job; noticing the whole
 * question is missing is what nobody does reliably at four in the afternoon.
 */
const SCOPES = [
  "studentId",
  "studentIds",
  "guardianId",
  "wardIds",
  "wardId",
  "userId",
  "user.id",
  "enrolledStudentIds",
];

const ESCAPE = /\/\/\s*portal-scope:/;

/**
 * Whether the comment block above a call carries the escape.
 *
 * The whole block, not the line immediately above it. The first version read
 * one line, so a two-line reason — which is most reasons worth writing —
 * defeated its own escape hatch, and the guard reported queries whose
 * exemption was sitting directly above them. A guard that punishes a
 * paragraph is a guard people learn to work around.
 */
function escaped(lines, line) {
  for (let index = line - 2; index >= 0; index -= 1) {
    const text = (lines[index] ?? "").trim();
    if (text === "") continue;
    if (!text.startsWith("//") && !text.startsWith("*") && !text.startsWith("/*")) {
      return false;
    }
    if (ESCAPE.test(text)) return true;
  }
  return false;
}

function walk(directory) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

/** The argument list of a call starting at the open bracket. */
function argumentsAt(source, open) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return source.slice(open + 1);
}

const problems = [];
let checked = 0;

for (const portal of PORTALS) {
  for (const file of walk(join(ROOT, portal))) {
    const source = readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);

    const pattern = new RegExp(`\\bdb\\.(\\w+)\\.(${OPERATIONS.join("|")})\\s*\\(`, "g");

    for (const match of source.matchAll(pattern)) {
      checked += 1;

      const line = source.slice(0, match.index).split(/\r?\n/).length;
      if (escaped(lines, line)) continue;

      const args = argumentsAt(source, match.index + match[0].length - 1);
      if (SCOPES.some((scope) => args.includes(scope))) continue;

      problems.push({
        file: relative(ROOT, file).replace(/\\/g, "/"),
        line,
        call: `db.${match[1]}.${match[2]}`,
      });
    }
  }
}

if (problems.length === 0) {
  console.log(`  ok  All ${checked} portal queries are scoped to the viewer.`);
  process.exit(0);
}

console.error("");
console.error("─".repeat(72));
console.error(`  ${problems.length} portal query(ies) do not mention the viewer`);
console.error("─".repeat(72));
console.error("");
for (const problem of problems) {
  console.error(`    ${problem.file}:${problem.line}`);
  console.error(`      ${problem.call}: nothing in its arguments names the`);
  console.error("      signed-in guardian, pupil or their wards.");
  console.error("");
}
console.error("  Constrain it on the viewer, or, if it really is the same for");
console.error("  every family, say so on the line above:");
console.error("");
console.error("    // portal-scope: the school calendar is one calendar");
console.error("");
console.error("  A parent reading another family's record is not an error");
console.error("  anything can catch. The page renders perfectly.");
console.error("");
console.error("─".repeat(72));
console.error("");
process.exit(1);
