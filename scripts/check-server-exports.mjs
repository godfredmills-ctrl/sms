/**
 * Refuses a build in which a "use server" module exports anything but an
 * async function.
 *
 * This exists because of a defect that got all the way to a live school. A
 * server-actions module exported a plain array of constants — perfectly
 * ordinary TypeScript, shared with the client component that renders the
 * form. It type-checked. It built. `next build` printed a clean route table.
 * Then the first person to open the page got a 500 and this in the log:
 *
 *     A "use server" file can only export async functions, found object.
 *
 * The rule is a runtime one: every export of a "use server" module becomes a
 * callable server endpoint, and a value that is not a function cannot be one.
 * Nothing in the type system says so, and nothing in the build enforces it,
 * so the gap between "compiles" and "works" was exactly one page load wide.
 *
 * The fix in each case is to move the constant into a plain module beside
 * the actions and import it from both sides — which is better anyway, since
 * the alternative was usually a second copy of the same list living in the
 * component.
 *
 * Deliberately a text scan rather than a parse: it has no dependencies, runs
 * in milliseconds, and the shapes it looks for are the shapes people write.
 * It errs toward reporting — a false positive costs a moved constant.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "src";

/** Every .ts/.tsx file under src, excluding nothing — actions hide anywhere. */
function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

/**
 * The directive must be the first statement in the module. A "use server"
 * string sitting inside a function body marks that function alone and says
 * nothing about the module's exports.
 */
function isServerModule(source) {
  const head = source
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("//") && !line.startsWith("/*") && !line.startsWith("*"));
  return head === '"use server";' || head === "'use server';";
}

/**
 * Exports that are legal in such a module:
 *   export async function name(...)
 *   export const name = async (...) => ...        (a function value)
 *   export type / export interface                 (erased before runtime)
 * Everything else is a value the runtime will reject.
 */
const OFFENDERS = [
  { pattern: /^export\s+(?!async\s)function\s+([A-Za-z0-9_$]+)/gm, what: "a synchronous function" },
  { pattern: /^export\s+class\s+([A-Za-z0-9_$]+)/gm, what: "a class" },
  { pattern: /^export\s+(?:const\s+)?enum\s+([A-Za-z0-9_$]+)/gm, what: "an enum" },
  { pattern: /^export\s+default\s+(?!async\s)(?!function\b)/gm, what: "a default export" },
];

/**
 * `export const NAME` — where the answer is whatever sits after the `=`.
 *
 * Not a regex, because the interesting shape defeats one. A const can carry
 * a function type annotation, and that annotation contains an arrow:
 *
 *     export const goAction: (v: string) => Promise<string> = async (v) => v;
 *
 * The first `=` on that line belongs to the `=>` in the type, not to the
 * assignment. A pattern that takes it for the assignment reads `>` as the
 * right-hand side and reports a perfectly good action; one that skips every
 * `=>` loses the assignment on the synchronous version of the same line and
 * reports nothing. Walking the characters and naming which `=` is an
 * assignment gets both right.
 */
const CONST_EXPORT = /^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm;

function rightHandSide(source, from) {
  for (let i = from; i < source.length; i += 1) {
    const char = source[i];
    if (char === ";") return null; // a declaration with no initialiser
    if (char !== "=") continue;

    // `=>`, `==`, `===` are not assignments; nor is the `=` of `!=`/`>=`/`<=`.
    if (source[i + 1] === ">" || source[i + 1] === "=") {
      i += 1;
      continue;
    }
    if ("!<>=".includes(source[i - 1])) continue;

    return source.slice(i + 1, i + 40).trim();
  }
  return null;
}

const problems = [];

for (const file of sourceFiles(ROOT)) {
  const source = readFileSync(file, "utf8");
  if (!isServerModule(source)) continue;

  const at = (index) => source.slice(0, index).split("\n").length;

  for (const { pattern, what } of OFFENDERS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      problems.push({
        file: relative(".", file),
        line: at(match.index),
        name: match[1] ?? "default",
        what,
      });
    }
  }

  CONST_EXPORT.lastIndex = 0;
  let declaration;
  while ((declaration = CONST_EXPORT.exec(source)) !== null) {
    const rhs = rightHandSide(source, declaration.index + declaration[0].length);
    // The only legal right-hand side is an async function. Everything else —
    // an array, an object, a literal, a synchronous arrow — is a value the
    // runtime cannot turn into an endpoint.
    if (rhs !== null && /^async\b/.test(rhs)) continue;
    problems.push({
      file: relative(".", file),
      line: at(declaration.index),
      name: declaration[1],
      what: "a value that is not an async function",
    });
  }
}

if (problems.length === 0) {
  console.log('  ok  Every "use server" module exports only async functions.');
  process.exit(0);
}

const line = "─".repeat(72);
console.error(`\n${line}`);
console.error('  A "use server" module exports something that is not an async function');
console.error(line);
console.error(
  "\n  Next.js turns every export of such a module into a callable endpoint,",
);
console.error("  so a non-function export throws at runtime — after a clean build:\n");
console.error('      A "use server" file can only export async functions, found object.\n');

for (const problem of problems) {
  console.error(`    ${problem.file}:${problem.line}`);
  console.error(`      exports ${problem.what}: ${problem.name}`);
}

console.error(
  "\n  Move each one into a plain module beside the actions and import it from",
);
console.error("  both the action and the component that needs it.\n");
console.error(`${line}\n`);
process.exit(1);
