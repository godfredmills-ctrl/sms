"use client";

import { useMemo, useRef, useState } from "react";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table as TableIcon,
} from "lucide-react";

import { parseMarkdown, wordCount, type Block, type Inline } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * Formatting for text somebody writes and the school then prints.
 *
 * A textarea with a toolbar, not a contenteditable surface. Three reasons,
 * in order of how much they matter here.
 *
 * What is stored is Markdown, which is text — safe to keep, safe to render,
 * readable in a database row a year later, and impossible to turn into a
 * script tag on the way back out. A rich editor stores HTML, and HTML has to
 * be sanitised on every path that shows it: the page, the PDF, an email.
 *
 * The preview below the box is rendered from the same parseMarkdown() the
 * PDF renderer uses. A preview that agrees with the paper by coincidence is
 * worse than no preview at all, because people sign what the preview showed
 * them. Here they cannot disagree about what the text means; only about
 * fonts.
 *
 * And a textarea keeps working. Paste from Word, undo with the keyboard,
 * spellcheck, a screen reader — all of it is the browser's, and none of it
 * has to be rebuilt.
 *
 * Nobody has to learn the syntax: the toolbar writes it, and the preview
 * shows the result. Somebody who does know it can simply type.
 */

type Tool =
  | { kind: "wrap"; icon: typeof Bold; label: string; marker: string; sample: string }
  | { kind: "line"; icon: typeof Bold; label: string; prefix: string; sample: string }
  | { kind: "block"; icon: typeof Bold; label: string; text: string };

const TOOLS: Tool[] = [
  { kind: "wrap", icon: Bold, label: "Bold", marker: "**", sample: "bold text" },
  { kind: "wrap", icon: Italic, label: "Italic", marker: "*", sample: "italic text" },
  { kind: "line", icon: Heading2, label: "Heading", prefix: "## ", sample: "Heading" },
  { kind: "line", icon: Heading3, label: "Sub-heading", prefix: "### ", sample: "Sub-heading" },
  { kind: "line", icon: List, label: "Bullet list", prefix: "- ", sample: "First point" },
  { kind: "line", icon: ListOrdered, label: "Numbered list", prefix: "1. ", sample: "First point" },
  { kind: "line", icon: Quote, label: "Quotation", prefix: "> ", sample: "Quoted text" },
  { kind: "block", icon: Minus, label: "Divider", text: "\n---\n" },
  {
    kind: "block",
    icon: TableIcon,
    label: "Table",
    text: "\n| Item | Amount |\n| --- | --- |\n| First | 0.00 |\n| Second | 0.00 |\n",
  },
];

export function RichText({
  name,
  defaultValue = "",
  rows = 18,
  id,
}: {
  name: string;
  defaultValue?: string;
  rows?: number;
  id?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [showPreview, setShowPreview] = useState(true);
  const box = useRef<HTMLTextAreaElement>(null);

  const blocks = useMemo(() => parseMarkdown(value), [value]);
  // Counted from the parsed text, so the markers that arrange the words are
  // not counted as words themselves.
  const words = useMemo(() => wordCount(value), [value]);

  /** Applies a tool to the selection, keeping the cursor where a typist expects. */
  function apply(tool: Tool) {
    const field = box.current;
    if (!field) return;

    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = value.slice(start, end);

    let next = value;
    let caretFrom = start;
    let caretTo = end;

    if (tool.kind === "wrap") {
      if (selected && /\n\s*\n/.test(selected)) {
        // A marker pair cannot reach across a blank line. The parser ends the
        // paragraph there, so the opening ** never meets its closing one and
        // the reader gets four asterisks and no bold — from a button press
        // that looked like it worked. Each paragraph is wrapped on its own.
        const wrapped = selected
          .split(/(\n\s*\n)/)
          .map((part) => {
            if (!part.trim()) return part;
            const lead = /^\s*/.exec(part)![0];
            const trail = /\s*$/.exec(part)![0];
            const body = part.slice(lead.length, part.length - trail.length);
            return `${lead}${tool.marker}${body}${tool.marker}${trail}`;
          })
          .join("");
        next = value.slice(0, start) + wrapped + value.slice(end);
        caretFrom = start;
        caretTo = start + wrapped.length;
      } else {
        const inner = selected || tool.sample;
        next = value.slice(0, start) + tool.marker + inner + tool.marker + value.slice(end);
        // With nothing selected the sample lands selected, so typing replaces it.
        caretFrom = start + tool.marker.length;
        caretTo = caretFrom + inner.length;
      }
    }

    if (tool.kind === "line") {
      // Prefixes belong at the start of the line, not at the cursor: putting
      // "## " mid-sentence makes a hash, not a heading.
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = end === start ? value.indexOf("\n", start) : end;
      const stop = lineEnd === -1 ? value.length : lineEnd;
      const existing = value.slice(lineStart, stop);
      const usingSample = existing.trim() === "";
      const chunk = usingSample ? tool.sample : existing;

      // A numbered list carries on from the one above it. Numbering from the
      // top of the selection instead meant that adding three more points to a
      // list of two produced 1, 2, 1, 2, 3.
      let counter = 0;
      if (tool.prefix === "1. " && lineStart > 0) {
        const before = value.slice(0, lineStart - 1);
        const above = before.slice(before.lastIndexOf("\n") + 1);
        const numbered = /^\s*(\d+)[.)]\s/.exec(above);
        if (numbered) counter = Number(numbered[1]);
      }

      const prefixed = chunk
        .split("\n")
        .map((line) => {
          // A blank line inside the selection is left blank. Prefixed, it
          // became an empty bullet, an empty quotation, or — in a numbered
          // list — an empty point that took a number with it and pushed
          // every following point one out.
          if (!line.trim()) return line;
          counter += 1;
          return tool.prefix === "1. " ? `${counter}. ${line}` : `${tool.prefix}${line}`;
        })
        .join("\n");

      next = value.slice(0, lineStart) + prefixed + value.slice(stop);
      caretTo = lineStart + prefixed.length;
      // The sample lands selected, the same as it does for bold, so typing
      // replaces it. Left with the caret after it, the word "Heading" stayed
      // in the letter until somebody noticed and deleted it.
      caretFrom = usingSample ? caretTo - tool.sample.length : caretTo;
    }

    if (tool.kind === "block") {
      // On its own line, or a table typed at the end of a sentence is a
      // sentence with pipes in it.
      const needsBreak = start > 0 && value[start - 1] !== "\n";
      const insert = (needsBreak ? "\n" : "") + tool.text;
      next = value.slice(0, start) + insert + value.slice(end);
      caretFrom = start + insert.length;
      caretTo = caretFrom;
    }

    setValue(next);
    // After React has written the new value, put the caret back.
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(caretFrom, caretTo);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-t-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-1.5">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            onClick={() => apply(tool)}
            title={tool.label}
            aria-label={tool.label}
            className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            <tool.icon className="size-4" />
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2 pr-1">
          <span className="numeric text-[11px] text-[var(--text-subtle)]">
            {words} {words === 1 ? "word" : "words"}
          </span>
          <button
            type="button"
            onClick={() => setShowPreview((on) => !on)}
            className="text-xs font-medium text-[var(--primary)]"
          >
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
        </span>
      </div>

      <textarea
        ref={box}
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        spellCheck
        className="-mt-2 block w-full rounded-b-[var(--radius)] border border-t-0 border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text)] outline-none focus:border-[var(--primary)]"
      />

      {showPreview ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-4">
          <p className="mb-3 text-[11px] font-medium tracking-wide text-[var(--text-subtle)] uppercase">
            How it will print
          </p>
          <MarkdownPreview blocks={blocks} />
        </div>
      ) : null}
    </div>
  );
}

function Runs({ runs }: { runs: Inline[] }) {
  return (
    <>
      {runs.map((run, index) => {
        const content = run.code ? (
          <code className="rounded bg-[var(--surface-2)] px-1 font-mono text-[0.9em]">
            {run.text}
          </code>
        ) : (
          run.text
        );
        return (
          <span
            key={index}
            className={cn(run.bold && "font-semibold", run.italic && "italic")}
          >
            {content}
          </span>
        );
      })}
    </>
  );
}

/**
 * The preview.
 *
 * Reads the same block model the PDF renderer lays out, so the two can only
 * differ in typeface and measure — never in what a line of text means.
 */
export function MarkdownPreview({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0 || (blocks.length === 1 && blocks[0].type === "paragraph" && !blocks[0].runs[0]?.text)) {
    return (
      <p className="text-sm text-[var(--text-subtle)]">
        Nothing written yet. Use the buttons above, or type normally.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed text-[var(--text)]">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "rule":
            return <hr key={index} className="border-[var(--border)]" />;

          case "heading": {
            const size =
              block.level === 1
                ? "text-lg font-semibold"
                : block.level === 2
                  ? "text-base font-semibold"
                  : "text-sm font-semibold";
            // A real heading element, not a paragraph in a heavier weight.
            // The preview is how somebody checks the shape of what they have
            // written, and to a screen reader a styled <p> has no shape at
            // all — the document read as one flat run of text. Levels start
            // at h2 because the page around this already has its h1.
            const Tag = (["h2", "h3", "h4"] as const)[block.level - 1];
            return (
              <Tag key={index} className={cn(size, "mt-4")}>
                <Runs runs={block.runs} />
              </Tag>
            );
          }

          case "quote":
            return (
              <blockquote
                key={index}
                className="border-l-2 border-[var(--border)] pl-3 text-[var(--text-muted)]"
              >
                <Runs runs={block.runs} />
              </blockquote>
            );

          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag
                key={index}
                className={cn(
                  "ml-5 space-y-1",
                  block.ordered ? "list-decimal" : "list-disc",
                )}
              >
                {block.items.map((item, at) => (
                  <li key={at}>
                    <Runs runs={item} />
                  </li>
                ))}
              </Tag>
            );
          }

          case "table":
            return (
              <div key={index} className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[var(--surface-2)]">
                      {block.header.map((cell, at) => (
                        <th
                          key={at}
                          className="border border-[var(--border)] px-2 py-1 text-left font-semibold"
                        >
                          <Runs runs={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, at) => (
                      <tr key={at}>
                        {row.map((cell, cellAt) => (
                          <td
                            key={cellAt}
                            className="border border-[var(--border)] px-2 py-1"
                          >
                            <Runs runs={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          default:
            return (
              <p key={index}>
                <Runs runs={block.runs} />
              </p>
            );
        }
      })}
    </div>
  );
}
