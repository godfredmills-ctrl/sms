/**
 * Refuses a build in which a PDF renderer draws text it has not sanitised.
 *
 * The standard PDF fonts are WinAnsi-encoded and pdf-lib throws rather than
 * substituting, so a character the encoding has no room for takes the whole
 * download down with a 500. In Ghana those characters are in the names: the
 * Twi letters ɛ and ɔ. A child called Kwabɛna could not be issued a report
 * card, a transcript or a certificate — on documents whose entire purpose is
 * to carry their name.
 *
 * src/lib/pdf.ts was written before src/lib/pdf-text.ts existed and was never
 * swept; four sibling renderers written later all sanitise. Nothing connected
 * the two facts, which is what this check is for.
 *
 * It is a coarse check on purpose — a file that draws text must import the
 * sanitiser — because the precise version (does THIS string reach THAT call
 * clean?) is a dataflow analysis, and the coarse one already catches the way
 * this actually goes wrong: a new renderer, written from scratch, that nobody
 * remembered to tell.
 *
 * Note for anyone fixing a failure here: sanitising at the drawText call is
 * not sufficient on its own. pdf-lib also throws from widthOfTextAtSize, and
 * renderers measure before they wrap, truncate or centre — so the crash
 * arrives several steps before any ink. Clean the input on the way in.
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

const problems = [];

for (const file of sourceFiles("src")) {
  const source = readFileSync(file, "utf8");

  const draws = (source.match(/\.drawText\(/g) || []).length;
  if (draws === 0) continue;

  // The sanitiser itself, and anything that imports it, is fine.
  if (file.endsWith(join("lib", "pdf-text.ts"))) continue;
  if (source.includes("sanitisePdfText")) continue;

  problems.push({ file: relative(".", file), draws });
}

if (problems.length === 0) {
  console.log("  ok  Every PDF renderer sanitises the text it draws.");
  process.exit(0);
}

const rule = "─".repeat(72);
console.error(`\n${rule}`);
console.error("  A PDF renderer draws text without sanitising it");
console.error(rule);
console.error(
  "\n  pdf-lib throws on any character WinAnsi cannot encode, so a Ghanaian",
);
console.error("  name containing ɛ or ɔ 500s the download rather than degrading.\n");

for (const problem of problems) {
  console.error(`    ${problem.file} — ${problem.draws} drawText call(s), no sanitisePdfText`);
}

console.error("\n  Clean the input where it enters the renderer, not at each draw:");
console.error("  widthOfTextAtSize throws too, and measuring happens first.\n");
console.error(`${rule}\n`);
process.exit(1);
