/**
 * Refuses a build where a package.json script would crash on its first import.
 *
 * Modules under src/lib that touch the database carry `import "server-only"`,
 * which resolves to a file whose entire body is a throw — unless Node is asked
 * for the `react-server` export condition. Next does that for us; a bare `tsx`
 * does not.
 *
 * So a script that imports one of those modules and is run as `tsx foo.ts`
 * dies on line one, before printing anything of its own. That is exactly what
 * happened to `npm run db:seed`: seed.ts grew an import of src/lib/exam-marks
 * and the whole seed — and `npm run setup`, and `prisma migrate reset` — began
 * failing with an error about Client Components that has nothing to do with
 * anything the seed does.
 *
 * Nothing catches it. It type-checks, it builds, and the guards all pass,
 * because none of them run the script. This one reads the imports instead.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();

/** Every src/lib module whose first lines mark it server-only. */
function serverOnly(file) {
  if (!existsSync(file)) return false;
  const head = readFileSync(file, "utf8").slice(0, 400);
  return /^\s*import\s+["']server-only["']/m.test(head);
}

/** The modules a file imports, resolved to paths on disk. */
function importsOf(file) {
  const source = readFileSync(file, "utf8");
  const found = [];
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    const specifier = match[1];
    let target = null;
    if (specifier.startsWith("@/")) {
      target = join(root, "src", specifier.slice(2));
    } else if (specifier.startsWith(".")) {
      target = resolve(dirname(file), specifier);
    }
    if (!target) continue;
    for (const suffix of [".ts", ".tsx", "/index.ts", ""]) {
      if (existsSync(target + suffix) && !target.endsWith("/")) {
        found.push(target + suffix);
        break;
      }
    }
  }
  return found;
}

/** Server-only modules reachable from a script, following imports. */
function reachesServerOnly(entry, seen = new Set()) {
  if (seen.has(entry) || seen.size > 400) return null;
  seen.add(entry);
  for (const next of importsOf(entry)) {
    if (serverOnly(next)) return next;
    const deeper = reachesServerOnly(next, seen);
    if (deeper) return deeper;
  }
  return null;
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const scripts = { ...(pkg.scripts ?? {}) };
if (pkg.prisma?.seed) scripts["prisma.seed"] = pkg.prisma.seed;

const problems = [];

for (const [name, command] of Object.entries(scripts)) {
  // Only the ones that run a TypeScript entry point through tsx directly.
  const match = /(?:^|\s)tsx\s+((?:--\S+\s+)*)(\S+\.ts)/.exec(command);
  if (!match) continue;
  const flags = match[1] ?? "";
  if (flags.includes("--conditions=react-server")) continue;

  const entry = join(root, match[2]);
  if (!existsSync(entry)) continue;

  const culprit = reachesServerOnly(entry);
  if (culprit) {
    problems.push({ name, command, entry: match[2], culprit: culprit.replace(root, "").replace(/\\/g, "/") });
  }
}

if (problems.length === 0) {
  console.log("  ok  Every tsx script can load the modules it imports.");
  process.exit(0);
}

console.error("");
console.error("─".repeat(72));
console.error("  A package.json script would crash on its first import");
console.error("─".repeat(72));
console.error("");
for (const problem of problems) {
  console.error(`    ${problem.name}:  ${problem.command}`);
  console.error(`      ${problem.entry} reaches ${problem.culprit}, which is server-only.`);
  console.error("");
}
console.error("  Add --conditions=react-server to the tsx call, the way");
console.error("  pdf:preview and exams:check already do. Without it, Node");
console.error("  resolves \"server-only\" to a module whose whole body is a");
console.error("  throw, and the script dies before it runs a line of its own.");
console.error("");
console.error("─".repeat(72));
console.error("");
process.exit(1);
