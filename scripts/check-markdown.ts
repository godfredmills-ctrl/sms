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

const table = parseMarkdown("| Item | Cost |\n| --- | --- |\n| Books | 40 |\n| Bus | 450 |")[0];
check("table header", table.type === "table" && table.header.length, 2);
check("table rows", table.type === "table" && table.rows.length, 2);
check(
  "pipes without a separator row are just text",
  kinds("Monday | Tuesday | Wednesday"),
  ["paragraph"],
);

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
