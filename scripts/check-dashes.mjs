#!/usr/bin/env node
/**
 * No em dashes or en dashes in anything a person reads.
 *
 * They are not wrong English, but they read as machine-written, and this is
 * software a school puts in front of parents. The house style is plain
 * punctuation: a comma, a colon, a full stop, or a pair of brackets.
 *
 * Only user-facing text is checked. Code comments are for whoever maintains
 * this and nobody else sees them, so they are left alone; the point of the
 * rule is what reaches a screen or a printed page.
 *
 * The classifier below strips comments before looking, and it is careful about
 * the two things that trip a naive version up: a `//` inside a string (every
 * URL in the codebase) is not a comment, and an apostrophe inside a comment is
 * not the start of a string.
 *
 *   node scripts/check-dashes.mjs          fail the build on any found
 *   node scripts/check-dashes.mjs --list   print every one with its line
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DASHES = /[—–]/;

/** Directories whose text nobody reads on a screen. */
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist"]);

/**
 * Files exempt, and why.
 *
 * This guard names the characters in order to ban them, and the document
 * renderer carries the same rule for the manual and the proposal.
 */
const EXEMPT = new Set([
  path.join("scripts", "check-dashes.mjs"),
  path.join("scripts", "make-documents.ts"),
  // The Markdown parser's own tests feed it dashes on purpose.
  path.join("scripts", "check-markdown.ts"),
  // Sanitising for PDF output is where a dash is deliberately handled.
  path.join("src", "lib", "pdf-text.ts"),
]);

/**
 * Everything that is not a comment.
 *
 * Walks the source once, tracking whether it is inside a string, a template
 * literal, a line comment or a block comment, and blanks out the comments.
 * Positions are preserved so a line number still means something.
 */
export function stripComments(source) {
  const out = [];
  let index = 0;
  let state = "code";
  let quote = "";

  /**
   * Whether a `/` here begins a regular expression rather than a division.
   *
   * This has to be answered, and answering it wrong is not cosmetic. The
   * codebase contains `.replace(/"/g, "&quot;")`: read as division, the quote
   * inside the regex opens a string that never closes, and from that point on
   * the whole file looks like one long string. The first version of this
   * classifier did exactly that and reported every comment in the file as text
   * a person reads.
   *
   * The usual heuristic: a slash after an operator, an opening bracket, or a
   * keyword starts a regex; a slash after a value divides.
   */
  function regexCanStartHere() {
    for (let back = out.length - 1; back >= 0; back -= 1) {
      const previous = out[back];
      if (previous === " " || previous === "\n" || previous === "\t" || previous === "\r") {
        continue;
      }
      if ("(,=:[!&|?{};+-*%<>~^".includes(previous)) return true;
      // `return /x/`, `typeof /x/`, and friends.
      const tail = out.slice(Math.max(0, back - 7), back + 1).join("");
      return /\b(return|typeof|case|in|of|new|delete|void|do|else|yield|await)$/.test(tail);
    }
    return true;
  }

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (state === "code") {
      if (char === "/" && next !== "/" && next !== "*" && regexCanStartHere()) {
        // Consume the regex whole, including its character classes, so a
        // quote or a slash inside it cannot be mistaken for anything else.
        let cursor = index + 1;
        let inClass = false;
        while (cursor < source.length) {
          const inner = source[cursor];
          if (inner === "\\") {
            cursor += 2;
            continue;
          }
          if (inner === "[") inClass = true;
          else if (inner === "]") inClass = false;
          else if (inner === "/" && !inClass) break;
          else if (inner === "\n") break;
          cursor += 1;
        }
        for (let position = index; position <= cursor && position < source.length; position += 1) {
          out.push(source[position]);
        }
        index = cursor + 1;
        continue;
      }
      if (char === "/" && next === "/") {
        state = "line";
        out.push(" ", " ");
        index += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        state = "block";
        out.push(" ", " ");
        index += 2;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        state = "string";
        quote = char;
        out.push(char);
        index += 1;
        continue;
      }
      out.push(char);
      index += 1;
      continue;
    }

    if (state === "string") {
      // An escaped quote does not end the string.
      if (char === "\\") {
        out.push(char, next ?? "");
        index += 2;
        continue;
      }
      if (char === quote) state = "code";
      out.push(char);
      index += 1;
      continue;
    }

    if (state === "line") {
      if (char === "\n") {
        state = "code";
        out.push(char);
      } else {
        out.push(" ");
      }
      index += 1;
      continue;
    }

    // block
    if (char === "*" && next === "/") {
      state = "code";
      out.push(" ", " ");
      index += 2;
      continue;
    }
    out.push(char === "\n" ? "\n" : " ");
    index += 1;
  }

  return out.join("");
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    if (SKIP_DIRS.has(entry)) continue;
    const relative = path.join(dir, entry);
    const full = path.join(ROOT, relative);
    if (statSync(full).isDirectory()) yield* sourceFiles(relative);
    else if (/\.(ts|tsx|mjs)$/.test(entry)) yield relative;
  }
}

/**
 * Importing this module must not run the check.
 *
 * The transform that fixes these reuses stripComments, and an import with a
 * side effect meant the guard ran first and printed its own failure over the
 * transform's output.
 */
const invokedDirectly = Boolean(process.argv[1]?.endsWith("check-dashes.mjs"));

const findings = [];

if (!invokedDirectly) {
  // Imported for stripComments alone.
} else
for (const root of ["src", "scripts", "prisma"]) {
  let exists = true;
  try {
    statSync(path.join(ROOT, root));
  } catch {
    exists = false;
  }
  if (!exists) continue;

  for (const file of sourceFiles(root)) {
    if (EXEMPT.has(file)) continue;

    const source = readFileSync(path.join(ROOT, file), "utf8");
    if (!DASHES.test(source)) continue;

    const stripped = stripComments(source);
    stripped.split("\n").forEach((line, index) => {
      if (DASHES.test(line)) {
        findings.push({
          file,
          line: index + 1,
          text: source.split("\n")[index].trim().slice(0, 110),
        });
      }
    });
  }
}

if (process.argv.includes("--list")) {
  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line}\n    ${finding.text}`);
  }
  console.log(`\n  ${findings.length} line(s) with a dash in user-facing text.`);
  process.exit(0);
}

if (findings.length) {
  console.error(
    `\n  ${findings.length} line(s) put an em or en dash in front of a person:\n`,
  );
  for (const finding of findings.slice(0, 25)) {
    console.error(`  ${finding.file}:${finding.line}`);
    console.error(`    ${finding.text}`);
  }
  if (findings.length > 25) {
    console.error(`\n  ...and ${findings.length - 25} more. Run with --list to see them all.`);
  }
  console.error(
    "\n  The house style is plain punctuation: a comma, a colon, a full stop,",
  );
  console.error("  or a pair of brackets. Code comments are exempt.\n");
  process.exit(1);
}

console.log("  dashes: no em or en dashes in user-facing text");
