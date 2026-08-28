/**
 * Guard: every guardian selection decides about deactivated guardians.
 *
 * A guardian can be switched off, and "the guardians of this student" is
 * selected in about a dozen queries written months apart. Honour the flag in
 * eleven and the twelfth keeps working perfectly while doing the wrong thing:
 * a fee reminder to a parent who left the family, or an emergency number on an
 * ID card that nobody answers. Nothing throws. The two halves simply disagree.
 *
 * So the filters live in src/lib/guardian-contact.ts and this refuses to build
 * a selection that does not use one. A query that genuinely wants everybody,
 * inactive included, says so on the line above:
 *
 *   // guardian-contact: the family record, including people who have left
 *   guardians: { ... }
 *
 * which is a decision somebody made rather than a line somebody forgot.
 *
 * Relation filters (`guardians: { some: ... }`) are not selections and are
 * skipped: they ask whether a student has a guardian, not which one to ring.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "src");

/** The module that owns the filters does not have to use them. */
const OWNER = join("src", "lib", "guardian-contact.ts");

/** Relation-filter keys: these ask "does one exist", not "which one". */
const FILTER_KEYS = ["some", "none", "every"];

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...walk(path));
    } else if (/\.tsx?$/.test(path)) {
      found.push(path);
    }
  }
  return found;
}

/**
 * The text between a `{` at `open` and the brace that closes it.
 *
 * Braces inside strings would throw this off, and Prisma selections do contain
 * strings. Quote-awareness is enough here: these are object literals, not
 * arbitrary code, so there are no template literals or regexes to confuse it.
 */
function objectBody(text, open) {
  let depth = 0;
  let quote = null;

  for (let index = open; index < text.length; index += 1) {
    const character = text[index];

    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open, index + 1);
    }
  }

  return text.slice(open);
}

export function checkGuardianContact() {
  const problems = [];

  for (const file of walk(SOURCE)) {
    const shown = relative(ROOT, file);
    if (shown === OWNER) continue;

    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");

    // Byte offset of the start of each line, so a line number maps to a
    // position in the whole file and the brace matcher can run from there.
    let offset = 0;
    const offsets = lines.map((line) => {
      const start = offset;
      offset += line.length + 1;
      return start;
    });

    lines.forEach((line, index) => {
      const brace = line.indexOf("guardians:");
      if (brace === -1) return;

      // The brace has to be the very next thing. A type declaration reads
      // `guardians: Array<{`, which is a shape rather than a query, and
      // flagging it would teach people the guard cries wolf.
      const open = brace + "guardians:".length;
      if (line.slice(open).trimStart()[0] !== "{") return;
      const braceAt = line.indexOf("{", open);

      const body = objectBody(text, offsets[index] + braceAt);

      // `guardians: { some: { ... } }` is a filter on the student, not a
      // selection of guardians to contact.
      const firstKey = /^\{\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_]+)\s*:/.exec(body)?.[1];
      if (firstKey && FILTER_KEYS.includes(firstKey)) return;

      if (body.includes("guardianLinks.")) return;

      // The opt-out, anywhere in the comment block above. Six lines because a
      // good reason usually runs to a sentence or two, and a guard that only
      // read three would push people into writing a worse one.
      const preceding = lines.slice(Math.max(0, index - 6), index).join("\n");
      if (preceding.includes("guardian-contact:")) return;

      problems.push(
        `${shown}:${index + 1} selects guardians without a contact filter.\n` +
          `    Use  where: guardianLinks.primary  (or .any / .emergency /\n` +
          `    .billPayers / .reportRecipients) from @/lib/guardian-contact,\n` +
          `    or write  // guardian-contact: <why everybody belongs here>\n` +
          `    on the line above if deactivated guardians should be included.`,
      );
    });

    // The other shape: the link table read directly rather than through a
    // student. This is how the discipline notification reached guardians, and
    // it is invisible to the check above — the word "guardians" never appears.
    // A guard that only knew one spelling would have passed a screen that
    // texts a parent who left the family about their child's suspension.
    lines.forEach((line, index) => {
      const call = /db\.studentGuardian\.(findMany|findFirst|findUnique|count|aggregate)\b/.exec(
        line,
      );
      if (!call) return;

      const open = line.indexOf("{", call.index);
      if (open === -1) return;

      const body = objectBody(text, offsets[index] + open);
      if (body.includes("guardianLinks.")) return;

      const preceding = lines.slice(Math.max(0, index - 6), index).join("\n");
      if (preceding.includes("guardian-contact:")) return;

      problems.push(
        `${shown}:${index + 1} reads the guardian link table without a contact filter.\n` +
          `    Spread a filter into the where:  { studentId, ...guardianLinks.any }\n` +
          `    or write  // guardian-contact: <why everybody belongs here>  above\n` +
          `    it. Scoping and authorisation checks are the usual exception: they\n` +
          `    ask whether this person is linked at all, not who to contact.`,
      );
    });
  }

  return problems;
}

const invokedDirectly = Boolean(
  process.argv[1]?.endsWith("check-guardian-contact.mjs"),
);

if (invokedDirectly) {
  const problems = checkGuardianContact();
  if (problems.length) {
    console.error(
      `\nGuardian contact filters: ${problems.length} selection${
        problems.length === 1 ? "" : "s"
      } undecided\n`,
    );
    for (const problem of problems) console.error(`  ${problem}\n`);
    process.exit(1);
  }
  console.log("Guardian contact filters: every selection decided.");
}
