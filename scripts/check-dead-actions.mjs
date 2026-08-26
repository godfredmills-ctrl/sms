/**
 * Refuses a build containing a Server Action nothing calls.
 *
 * Written after shipping the same defect twice in two days. The library got a
 * `setCopyStatusAction` — authorised, audited, guarded against setting a copy
 * available while someone still held it — and no component ever called it, so
 * no book could be marked lost, and the only route back from "being repaired"
 * was a bug in the return desk. A week later the transport module got a
 * `setVehicleActiveAction` with the same shape, so a bus that had broken down
 * could not be taken out of the capacity arithmetic and its route went on
 * counting seats that were sitting on a ramp.
 *
 * Both compiled. Both type-checked. Both read, in review, as finished
 * features — the action is the part that looks like the work, and the button
 * is the part that gets forgotten. Nothing in the language notices, because
 * an exported function with no caller is perfectly legal and usually fine;
 * it is only damning in a "use server" module, where the export exists for
 * exactly one reason.
 *
 * A dead action is worse than dead code. It reads as a capability the system
 * has. Someone reviewing permissions sees that copies can be marked lost;
 * someone planning work sees it as done. The gap only surfaces when a
 * librarian goes looking for the control and cannot find it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/** The directive must be the module's first statement to mark its exports. */
function isServerModule(source) {
  const head = source
    .split("\n")
    .map((line) => line.trim())
    .find(
      (line) => line && !line.startsWith("//") && !line.startsWith("/*") && !line.startsWith("*"),
    );
  return head === '"use server";' || head === "'use server';";
}

const files = sourceFiles("src");

// Read every file once — this runs on each build and the tree is not small.
const contents = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));

const problems = [];

for (const [file, source] of contents) {
  if (!isServerModule(source)) continue;

  const exported = [
    ...source.matchAll(/^export\s+async\s+function\s+([A-Za-z0-9_$]+)/gm),
    ...source.matchAll(/^export\s+const\s+([A-Za-z0-9_$]+)\s*(?::[^=]+?)?\s*=\s*async\b/gm),
  ].map((match) => ({
    name: match[1],
    line: source.slice(0, match.index).split("\n").length,
  }));

  for (const action of exported) {
    // A word-boundary search across every other file. Imports, JSX props and
    // direct calls all mention the name, so one hit anywhere is enough — the
    // question here is "nothing at all", not "used correctly".
    const pattern = new RegExp(`\\b${action.name}\\b`);

    let referenced = false;
    for (const [other, otherSource] of contents) {
      if (other === file) continue;
      if (pattern.test(otherSource)) {
        referenced = true;
        break;
      }
    }

    if (!referenced) {
      problems.push({ file: relative(".", file), line: action.line, name: action.name });
    }
  }
}

if (problems.length === 0) {
  console.log("  ok  Every Server Action has a caller.");
  process.exit(0);
}

const rule = "─".repeat(72);
console.error(`\n${rule}`);
console.error("  A Server Action is exported and never called");
console.error(rule);
console.error(
  "\n  In a \"use server\" module an export exists to be invoked from the client.",
);
console.error("  One with no caller is a capability the system appears to have and");
console.error("  does not: and it type-checks, builds, and reads as finished work.\n");

for (const problem of problems) {
  console.error(`    ${problem.file}:${problem.line}`);
  console.error(`      ${problem.name}`);
}

console.error("\n  Wire it to the control it was written for, or delete it.\n");
console.error(`${rule}\n`);
process.exit(1);
