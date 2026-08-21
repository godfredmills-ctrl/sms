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

  /** Whether a closing marker exists later, so an unmatched one stays literal. */
  const closes = (from: number, marker: string) => source.indexOf(marker, from) !== -1;

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
      if (!double && !triple && !insideWord && (italic || closes(index + 1, char))) {
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

/** A table row: `| a | b |` split into its cells. */
function tableCells(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const TABLE_SEPARATOR = /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/;

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

    // A table needs its separator row, or it is just text with pipes in it.
    if (
      trimmed.includes("|") &&
      index + 1 < lines.length &&
      TABLE_SEPARATOR.test(lines[index + 1]) &&
      lines[index + 1].includes("-")
    ) {
      flushParagraph();
      const header = tableCells(trimmed).map(parseInline);
      index += 2;
      const rows: Inline[][][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]).map(parseInline));
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
      const items: Inline[][] = [];

      while (index < lines.length) {
        const entry = lines[index].trim();
        const nextBullet = /^[-*+]\s+(.*)$/.exec(entry);
        const nextNumbered = /^(\d+)[.)]\s+(.*)$/.exec(entry);
        const matches = ordered ? nextNumbered : nextBullet;

        if (matches) {
          items.push(parseInline(ordered ? nextNumbered![2] : nextBullet![1]));
          index += 1;
          continue;
        }

        // An indented continuation belongs to the item above it.
        if (entry && /^\s{2,}/.test(lines[index]) && items.length) {
          const last = items[items.length - 1];
          items[items.length - 1] = parseInline(
            `${last.map((run) => run.text).join("")} ${entry}`,
          );
          index += 1;
          continue;
        }
        break;
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
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
