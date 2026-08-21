import { parseInline, parseMarkdown } from "../src/lib/markdown";
const B = String.fromCharCode(92); // one backslash
const S = (src: string) =>
  parseInline(src).map(r => r.text + (r.bold?"|b":"") + (r.italic?"|i":"") + (r.code?"|c":""));

console.log("\n== escapes (B = single backslash) ==");
const cases: [string,string][] = [
  ["5 B* 4", "5 " + B + "* 4"],
  ["5 B* 4 B* 3", "5 " + B + "* 4 " + B + "* 3"],
  ["BB*bold*", B + B + "*bold*"],
  ["trailing B", "ends with " + B],
  ["B at end after word", "word" + B],
  ["B` literal tick", "a " + B + "` b"],
  ["escaped pipe cell", "a " + B + "| b"],
];
for (const [label, src] of cases) console.log("  " + label + " -> " + JSON.stringify(S(src)));

console.log("\n== escaped pipe in a table ==");
const tbl = "| Item | Note |\n| --- | --- |\n| Bus | morning " + B + "| evening |";
console.log("  " + JSON.stringify(parseMarkdown(tbl)));

console.log("\n== list continuation with escapes ==");
const li = "- 5 " + B + "* 4 " + B + "* 3\n  and more";
console.log("  " + JSON.stringify(parseMarkdown(li)));

console.log("\n== quote variants ==");
for (const s of ["> a\n> - b", "> a\nnot quoted", ">no space"]) {
  console.log("  " + JSON.stringify(s) + " => " + JSON.stringify(parseMarkdown(s)));
}

console.log("\n== TABLE_SEPARATOR timing ==");
const SEP = /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/;
for (const n of [200, 400, 800, 1600, 3200]) {
  const line = "- ".repeat(n) + "x";
  const t = Date.now();
  SEP.test(line);
  console.log(`  ${n} pairs (${line.length} chars): ${Date.now() - t}ms`);
}
