import { parseInline, parseMarkdown, markdownToText } from "../src/lib/markdown";

const S = (src: string) =>
  parseInline(src).map(r => r.text + (r.bold?"|b":"") + (r.italic?"|i":"") + (r.code?"|c":""));
const K = (src: string) => parseMarkdown(src).map(b => b.type);

const line = (l: string) => console.log("  " + l);

console.log("\n== inline state machine ==");
for (const s of [
  "**bold *nested* text**",
  "*a **b** c*",
  "***",
  "**a*",
  "**",
  "*",
  "_",
  "a * b * c",
  "Fees marked * are provisional; items marked * are optional.",
  "**Total** is `a ** b` and the rest of the sentence.",
  "The rate is **12% `x ** y` and final.",
  "5 \* 4 \* 3",
  "trailing backslash \\",
  "\\*bold*",
  "***a**",
  "**a***",
  "*a*b*c*",
  "__a__ and _b_",
  "a_b_c",
  "snake_case_name and _emphasis_",
]) line(JSON.stringify(s) + " => " + JSON.stringify(S(s)));

console.log("\n== blocks ==");
for (const s of [
  "Monday | Tuesday\n---\nnext para",
  "Term 1 | Term 2\n---",
  "A | B\n- - -",
  "3. Third offence\n4. Fourth offence",
  "- one\n1. two\n- three",
  "Text right above:\n- one\n- two",
  "| A | B |\n| --- | --- |\n| 1 | 2 | 3 |",
  "| A | B |\n| --- | --- |\n| only |",
  "| A | B |\n| --- | --- |\n|  | 2 |",
  "| A \| B | C |\n| --- | --- |\n| 1 | 2 |",
  "- **bold** start\n  continued",
  "- 5 \* 4 \* 3\n  continued",
  "1. one\n  - sub bullet",
]) { console.log("  " + JSON.stringify(s)); console.log("    " + JSON.stringify(parseMarkdown(s))); }

console.log("\n== markdownToText ==");
for (const s of [
  "- one\n- two",
  "| A | B |\n| --- | --- |\n| 1 | 2 |",
  "3. Third\n4. Fourth",
]) console.log("  " + JSON.stringify(s) + " => " + JSON.stringify(markdownToText(s)));
