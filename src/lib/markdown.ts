/**
 * The small subset of Markdown a school document actually uses.
 *
 * Written rather than installed, for two reasons. The output has to be laid
 * out by pdf-lib, which draws runs of text at coordinates — so what a renderer
 * needs is a list of blocks and styled runs, not a string of HTML that would
 * then have to be parsed back. And storing Markdown rather than HTML means the
 * body of a letter is text: safe to keep, safe to show, readable in a database
 * row, and impossible to turn into a script tag on the way out.
 *
 * The same parse feeds the editor's preview and the printed PDF. That is the
 * point of it being one function: a preview that agrees with the paper only by
 * coincidence is worse than no preview, because it is trusted.
 *
 * What it understands is what HR writes:
 *
 *   # Heading            ## Sub-heading      ### Minor heading
 *   **bold**  *italic*  ***both***  `literal`
 *   - bullet             1. numbered
 *   > quoted
 *   ---                  (a rule)
 *   | a | b |            (a table, with a --- separator row)
 *
 * Everything else is left as the characters typed. A school letter containing
 * a stray asterisk should print a stray asterisk, not swallow the rest of the
 * sentence looking for a closing one.
 */

export type Inline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Rendered in a monospaced face — a reference, a code, a formula. */
  code?: boolean;
};

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; runs: Inline[] }
  | { type: "paragraph"; runs: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; runs: Inline[] }
  | { type: "rule" }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

/**
 * Inline styling, scanned character by character.
 *
 * A scanner rather than nested regular expressions: the patterns for
 * overlapping emphasis are the kind that backtrack badly, and this runs on
 * text somebody pasted in from Word. It is linear and cannot catastrophe.
 *
 * An unmatched marker is not a marker. `**` with no closing pair prints as
 * two asterisks, because a letter that silently loses its second half when
 * somebody types a bullet as `*` is worse than one with an odd character in it.
 */
export function parseInline(source: string): Inline[] {
  const runs: Inline[] = [];
  let text = "";
  let bold = false;
  let italic = false;
  let code = false;

  const flush = () => {
    if (!text) return;
    runs.push({
      text,
      ...(bold ? { bold: true } : {}),
      ...(italic ? { italic: true } : {}),
      ...(code ? { code: true } : {}),
    });
    text = "";
  };

  /**
   * Whether a closing marker exists later, so an unmatched one stays literal.
   *
   * Code spans and escapes are stepped over, because a marker inside one is
   * not a marker — the scanner below will not treat it as a closing marker
   * when it gets there, so neither may this. A plain search did, and
   * "Rooms 2 * 4 and `a * b`" found its partner inside the code span, opened
   * an emphasis that could never be closed, and printed the rest of the line
   * in italic.
   */
  const closes = (from: number, marker: string) => {
    let at = from;
    while (at < source.length) {
      if (source[at] === "\\") {
        at += 2;
        continue;
      }
      // Tested before the backtick is stepped over, so looking for the end of
      // a code span still finds the very next backtick.
      if (source.startsWith(marker, at)) return true;
      if (source[at] === "`") {
        const end = source.indexOf("`", at + 1);
        at = end === -1 ? at + 1 : end + 1;
        continue;
      }
      at += 1;
    }
    return false;
  };

  let index = 0;
  while (index < source.length) {
    const char = source[index];

    // A backslash makes the next character literal, and is itself dropped.
    if (char === "\\" && index + 1 < source.length) {
      text += source[index + 1];
      index += 2;
      continue;
    }

    // Inside a code run nothing else is a marker — that is what it is for.
    if (code) {
      if (char === "`") {
        flush();
        code = false;
        index += 1;
        continue;
      }
      text += char;
      index += 1;
      continue;
    }

    if (char === "`" && closes(index + 1, "`")) {
      flush();
      code = true;
      index += 1;
      continue;
    }

    if (char === "*" || char === "_") {
      const triple = source.startsWith(char.repeat(3), index);
      const double = source.startsWith(char.repeat(2), index);

      if (triple && (bold || italic || closes(index + 3, char.repeat(3)))) {
        flush();
        bold = !bold;
        italic = !italic;
        index += 3;
        continue;
      }
      if (double && (bold || closes(index + 2, char.repeat(2)))) {
        flush();
        bold = !bold;
        index += 2;
        continue;
      }
      // A single underscore inside a word — snake_case, a file name — is not
      // emphasis. Asterisks are, wherever they appear.
      const insideWord =
        char === "_" &&
        index > 0 &&
        /\w/.test(source[index - 1] ?? "") &&
        /\w/.test(source[index + 1] ?? "");
      // An opening marker needs a word after it, and a closing one a word
      // before it. Without that, the two footnote asterisks in "Fees marked *
      // are provisional; items marked * are optional." pair up: both vanish
      // and the clause between them prints italic. A school letter is full of
      // lone asterisks used as footnote marks, and none of them is emphasis.
      const opensHere = /\S/.test(source[index + 1] ?? "");
      const closesHere = italic && /\S/.test(source[index - 1] ?? "");

      if (
        !double &&
        !triple &&
        !insideWord &&
        (closesHere || (!italic && opensHere && closes(index + 1, char)))
      ) {
        flush();
        italic = !italic;
        index += 1;
        continue;
      }
    }

    text += char;
    index += 1;
  }

  flush();
  return runs.length ? runs : [{ text: "" }];
}

/**
 * A table row, split on its unescaped pipes.
 *
 * With a plain split, a pipe escaped to mean a literal pipe still cut the
 * cell in two and left the backslash behind — so "morning \| evening" in a
 * timetable became two cells, one ending in a stray slash, and the row then
 * had more cells than the header.
 */
function tableCells(line: string): string[] {
  const trimmed = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
  const cells: string[] = [];
  let current = "";

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "\\" && trimmed[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

/**
 * A separator row: pipes, dashes, colons and spaces, with at least one dash.
 *
 * Written as a character test rather than a pattern. The obvious regex —
 * `^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$` — has two overlapping runs that both
 * accept dashes and spaces, so a long line of dashes that fails at the end
 * makes the engine try every split: measured at 4.6 seconds for 51,000
 * characters, quadratic, and reachable by pasting a rule out of a Word
 * document. This is linear and cannot backtrack.
 */
function isTableSeparator(line: string): boolean {
  let sawDash = false;
  for (const char of line) {
    if (char === "-") sawDash = true;
    else if (char !== "|" && char !== ":" && char !== " " && char !== "\t") return false;
  }
  return sawDash;
}

/**
 * Markdown into blocks.
 *
 * Line-based, because every block this supports is decided by how its first
 * line starts. Consecutive lines of running text join into one paragraph, so
 * a letter typed with hard line breaks still wraps to the page rather than
 * printing one short line per line typed.
 */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", runs: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      index += 1;
      continue;
    }

    if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        runs: parseInline(heading[2].trim()),
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      const quoted: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoted.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", runs: parseInline(quoted.join(" ")) });
      continue;
    }

    // A table needs a separator row, and a separator row has pipes in it.
    // Without that last test, "Monday | Tuesday | Wednesday" with a "---"
    // divider under it became a one-row table and swallowed the divider —
    // two ordinary lines turning into something neither of them was.
    if (
      trimmed.includes("|") &&
      index + 1 < lines.length &&
      lines[index + 1].includes("|") &&
      lines[index + 1].includes("-") &&
      isTableSeparator(lines[index + 1])
    ) {
      flushParagraph();
      const headerCells = tableCells(trimmed);
      const width = Math.max(headerCells.length, 1);
      const header = headerCells.map((cell) => parseInline(cell));
      index += 2;
      const rows: Inline[][][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const cells = tableCells(lines[index]);

        // Every row is squared to the header here, once, so the preview and
        // the PDF are handed the same shape and cannot disagree about it.
        // They did: the browser grew a third column and showed the text,
        // while the PDF drew that cell at x=545 on a 595-point page and the
        // words ran off the paper. A short row is padded; a long one has its
        // overflow folded into the last column, because a cell somebody typed
        // should appear somewhere rather than nowhere.
        const squared =
          cells.length === width
            ? cells
            : cells.length < width
              ? [...cells, ...Array(width - cells.length).fill("")]
              : [...cells.slice(0, width - 1), cells.slice(width - 1).join("  ")];

        rows.push(squared.map((cell) => parseInline(cell)));
        index += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);

    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);

      // The raw source of each item is collected first and parsed once at the
      // end. Parsing each line as it arrives and then re-parsing a joined item
      // loses the formatting on the first line: by then the markers have been
      // consumed, so "- **Important:** bring the form" with a second line
      // under it came out with the bold gone — silently, in a letter.
      const sources: string[] = [];

      while (index < lines.length) {
        const entry = lines[index].trim();
        const nextBullet = /^[-*+]\s+(.*)$/.exec(entry);
        const nextNumbered = /^(\d+)[.)]\s+(.*)$/.exec(entry);
        const matches = ordered ? nextNumbered : nextBullet;

        if (matches) {
          sources.push(ordered ? nextNumbered![2] : nextBullet![1]);
          index += 1;
          continue;
        }

        // An indented continuation belongs to the item above it.
        if (entry && /^\s{2,}/.test(lines[index]) && sources.length) {
          sources[sources.length - 1] += ` ${entry}`;
          index += 1;
          continue;
        }
        break;
      }

      blocks.push({
        type: "list",
        ordered,
        items: sources.map((entry) => parseInline(entry)),
      });
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

/**
 * Every run of text in a document, block by block.
 *
 * The two callers below both want the words and not the punctuation that
 * arranges them, and getting that wrong in either place shows: a word count
 * that counts "##" and "---", or a search that matches "**" and misses the
 * word it wraps.
 */
function textRuns(blocks: Block[]): Inline[][] {
  return blocks.flatMap((block) => {
    switch (block.type) {
      case "rule":
        return [];
      case "list":
        return block.items;
      case "table":
        return [...block.header, ...block.rows.flat()];
      default:
        return [block.runs];
    }
  });
}

/**
 * Words, as the person who wrote them would count.
 *
 * Counting the raw source instead made "## Background" two words and a table
 * separator row four, so a one-page letter reported a length nobody could
 * reconcile with what was on the page.
 */
export function wordCount(source: string): number {
  let words = 0;
  for (const runs of textRuns(parseMarkdown(source))) {
    const text = runs
      .map((run) => run.text)
      .join("")
      .trim();
    if (text) words += text.split(/\s+/).length;
  }
  return words;
}

/**
 * The two columns a written document's text lives in, written together.
 *
 * plainText exists only so the register can be searched for words rather than
 * for Markdown, which means it is right exactly as long as it is written from
 * the same body every time. Handing that to each caller is how one of them
 * ends up not doing it — the seed, which writes three documents and would
 * have left all three unfindable, with nothing to show for it but a search
 * that quietly returns nothing.
 */
export function writtenBody(body: string): { body: string; plainText: string } {
  return { body, plainText: markdownToText(body) };
}

/** The document as plain text — for a search index, or an SMS of a notice. */
export function markdownToText(source: string): string {
  return parseMarkdown(source)
    .map((block) => {
      switch (block.type) {
        case "rule":
          return "";
        case "list":
          return block.items
            .map((item, at) =>
              `${block.ordered ? `${at + 1}.` : "-"} ${item.map((run) => run.text).join("")}`,
            )
            .join("\n");
        case "table":
          return [block.header, ...block.rows]
            .map((row) => row.map((cell) => cell.map((run) => run.text).join("")).join("  "))
            .join("\n");
        default:
          return block.runs.map((run) => run.text).join("");
      }
    })
    .filter(Boolean)
    .join("\n\n");
}
