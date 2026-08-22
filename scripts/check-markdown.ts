/**
 * The markdown parser, checked against the things people actually type.
 *
 *   npm run md:check
 *
 * It is worth a test file of its own because two different renderers consume
 * it — the editor's preview and the printed PDF — so a parsing mistake is a
 * mistake in a document that has already been signed. The cases below are
 * mostly the awkward ones: unmatched markers, asterisks used as bullets,
 * underscores inside file names, and text pasted out of Word.
 */
import { parseInline, parseMarkdown, markdownToText } from "../src/lib/markdown";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}`);
    console.log(`         expected ${b}`);
    console.log(`         actual   ${a}`);
  }
}

/** Runs as "text|flags" so the expectations below stay readable. */
const shape = (source: string) =>
  parseInline(source).map(
    (run) =>
      run.text +
      (run.bold ? "|b" : "") +
      (run.italic ? "|i" : "") +
      (run.code ? "|c" : ""),
  );

console.log("\nInline\n");

check("plain", shape("Dear Mrs Quartey"), ["Dear Mrs Quartey"]);
check("bold", shape("fees are **due**"), ["fees are ", "due|b"]);
check("italic", shape("see *note*"), ["see ", "note|i"]);
check("bold italic", shape("***urgent***"), ["urgent|b|i"]);
check("code", shape("ref `GCS/HR/14`"), ["ref ", "GCS/HR/14|c"]);

// The ones that matter: a stray marker must stay a character.
check("unmatched double stays literal", shape("2 ** 3 is six"), ["2 ** 3 is six"]);
check("unmatched single stays literal", shape("a * b"), ["a * b"]);
check("escaped asterisk", shape("5 \\* 4"), ["5 * 4"]);
check("underscore inside a word", shape("file_name_here.pdf"), ["file_name_here.pdf"]);
check("underscore emphasis around words", shape("_quietly_"), ["quietly|i"]);
check("bold inside a sentence", shape("the **head** said"), ["the ", "head|b", " said"]);
check("markers inside code are literal", shape("`a**b`"), ["a**b|c"]);

// A run of four or more is a line to write on, not emphasis. A leave-out pass
// printed as "Signed out at **by**", with the line itself gone and nowhere for
// the gate to sign.
check("a signature line survives", shape("Signed out at ________________    by ________________"), [
  "Signed out at ________________    by ________________",
]);
check("a short fill-in line survives", shape("Name: ____________"), ["Name: ____________"]);
check("four asterisks are not emphasis", shape("a **** b"), ["a **** b"]);
// Three is still emphasis, and two, and one.
check("three still means bold italic", shape("***both***"), ["both|b|i"]);
// (the block-level rule is checked under Blocks, where kinds() is defined)
// ...and a marker outside one must not pair with a marker inside it.
check("an asterisk does not pair into a later code span", shape("2 * 4 and `a * b`"), [
  "2 * 4 and ",
  "a * b|c",
]);
check("an asterisk does not pair past a code span", shape("2 * 4 and `x` then"), [
  "2 * 4 and ",
  "x|c",
  " then",
]);
check("empty", shape(""), [""]);

console.log("\nBlocks\n");

const kinds = (source: string) => parseMarkdown(source).map((block) => block.type);

check("heading levels", kinds("# One\n## Two\n### Three"), [
  "heading",
  "heading",
  "heading",
]);
check("hash without a space is not a heading", kinds("#notaheading"), ["paragraph"]);
check("rule", kinds("---"), ["rule"]);
// A run of underscores on its own line is still a rule — the four-or-more
// inline guard must not have swallowed the block-level one.
check("a rule of underscores", kinds("____"), ["rule"]);
check("quote", kinds("> mind the gap"), ["quote"]);

check(
  "hard-wrapped lines join into one paragraph",
  parseMarkdown("This letter runs\nover three\nlines.").length,
  1,
);

check(
  "blank line separates paragraphs",
  kinds("First para.\n\nSecond para."),
  ["paragraph", "paragraph"],
);

const bullets = parseMarkdown("- one\n- two\n- three")[0];
check("bullet list", bullets.type === "list" && bullets.items.length, 3);
check("bullet list is unordered", bullets.type === "list" && bullets.ordered, false);

const numbered = parseMarkdown("1. one\n2. two")[0];
check("numbered list", numbered.type === "list" && numbered.ordered, true);

check(
  "a list ends at a blank line",
  kinds("- one\n- two\n\nAfterwards."),
  ["list", "paragraph"],
);

// An item that runs onto a second line kept its text and lost its formatting:
// the first line was parsed, then the joined item was parsed again, by which
// point the markers had been consumed. Silently, in a letter.
const continued = parseMarkdown("- **Important:** bring the form\n  and a passport photo");
check(
  "a continued item keeps the bold from its first line",
  continued[0].type === "list" &&
    continued[0].items[0].some((run) => run.bold && run.text.includes("Important")),
  true,
);
check(
  "a continued item keeps the text from its second line",
  continued[0].type === "list" &&
    continued[0].items[0].map((run) => run.text).join("").includes("passport photo"),
  true,
);
check(
  "a continued item is still one item",
  continued[0].type === "list" && continued[0].items.length,
  1,
);

const table = parseMarkdown("| Item | Cost |\n| --- | --- |\n| Books | 40 |\n| Bus | 450 |")[0];
check("table header", table.type === "table" && table.header.length, 2);
check("table rows", table.type === "table" && table.rows.length, 2);
check(
  "pipes without a separator row are just text",
  kinds("Monday | Tuesday | Wednesday"),
  ["paragraph"],
);

// A line with pipes, then a divider, is a line and a divider. It became a
// one-row table that ate the divider, because the separator test never
// required the separator to have a pipe in it.
check(
  "a pipe line above a divider is not a table",
  kinds("Monday | Tuesday | Wednesday\n---\nAfterwards."),
  ["paragraph", "rule", "paragraph"],
);

// Rows are squared to the header in the parser, so the preview and the PDF
// receive the same shape. Un-squared, the browser grew a column and showed
// the text while the PDF drew it off the edge of the paper.
const wide = parseMarkdown("| A | B |\n| --- | --- |\n| one | two | three |");
check(
  "a long row is squared to the header",
  wide[0].type === "table" && wide[0].rows[0].length,
  2,
);
check(
  "the overflow is folded in, not dropped",
  wide[0].type === "table" &&
    wide[0].rows[0][1].map((run) => run.text).join("").includes("three"),
  true,
);
const short = parseMarkdown("| A | B | C |\n| --- | --- | --- |\n| only |");
check(
  "a short row is padded to the header",
  short[0].type === "table" && short[0].rows[0].length,
  3,
);

// An escaped pipe is a pipe, not a cell boundary.
const escaped = parseMarkdown("| Slot | Note |\n| --- | --- |\n| AM | morning \\| evening |");
check(
  "an escaped pipe stays inside its cell",
  escaped[0].type === "table" && escaped[0].rows[0].length,
  2,
);
check(
  "an escaped pipe keeps its character and loses its backslash",
  escaped[0].type === "table" &&
    escaped[0].rows[0][1].map((run) => run.text).join(""),
  "morning | evening",
);

// Footnote asterisks are not emphasis: they have a space after them.
check(
  "two footnote asterisks stay literal",
  shape("Fees marked * are provisional; items marked * are optional."),
  ["Fees marked * are provisional; items marked * are optional."],
);
check("emphasis still works beside them", shape("marked * and *this*"), [
  "marked * and ",
  "this|i",
]);

// The separator test used to be quadratic — 4.6 seconds at 51,000 characters.
const dashes = "- ".repeat(30_000) + "x";
const dashStart = Date.now();
parseMarkdown(dashes);
const dashElapsed = Date.now() - dashStart;
check(`a 60,000-character dash line parses quickly (${dashElapsed}ms)`, dashElapsed < 500, true);

console.log("\nWhole documents\n");

const letter = `# Staff Development Proposal

Dear **Board of Governors**,

The school proposes the following for the coming year:

1. A termly training day
2. A mentoring scheme for new teachers

| Item | Cost |
| --- | --- |
| Facilitator | 4,500 |

> Approved at the meeting of 14 March.

---

Yours faithfully,`;

check("a realistic document", kinds(letter), [
  "heading",
  "paragraph",
  "paragraph",
  "list",
  "table",
  "quote",
  "rule",
  "paragraph",
]);

check(
  "plain text drops the markers",
  markdownToText("## Title\n\nSome **bold** text.").includes("**"),
  false,
);

// Pathological input: this parser runs on whatever someone pastes in.
const nasty = "*".repeat(2000) + "\n" + "|".repeat(2000);
const started = Date.now();
parseMarkdown(nasty);
const elapsed = Date.now() - started;
check(`2,000 stray markers parse quickly (${elapsed}ms)`, elapsed < 500, true);

console.log(
  failures ? `\n  ${failures} FAILURE(S)\n` : "\n  Every case behaves as written.\n",
);
process.exit(failures ? 1 : 0);
