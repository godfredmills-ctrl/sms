/**
 * The block vocabulary the website builder edits and the public site renders.
 *
 * Blocks are stored as plain JSON on `SitePage.blocks`, which keeps the editor
 * and the renderer honest: neither can hold state the other cannot see, and a
 * page is portable between environments without a migration.
 *
 * There is deliberately no raw-HTML block. A school administrator pasting
 * markup from anywhere would be an XSS hole in the public site, and the
 * blocks below cover what a school page actually needs.
 */

export type BlockType =
  | "hero"
  | "richText"
  | "imageText"
  | "gallery"
  | "cards"
  | "stats"
  | "quote"
  | "cta"
  | "contact"
  | "news";

export type BlockField = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "image" | "url" | "list";
  hint?: string;
};

export type BlockDef = {
  type: BlockType;
  label: string;
  description: string;
  fields: BlockField[];
  defaults: Record<string, string>;
};

export type Block = {
  id: string;
  type: BlockType;
  props: Record<string, string>;
};

export const BLOCK_DEFS: BlockDef[] = [
  {
    type: "hero",
    label: "Hero banner",
    description: "Full-width headline with a background image and a button.",
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "subheading", label: "Subheading", kind: "textarea" },
      { key: "imageUrl", label: "Background image", kind: "image" },
      { key: "ctaLabel", label: "Button text", kind: "text" },
      { key: "ctaHref", label: "Button link", kind: "url" },
    ],
    defaults: {
      heading: "Excellence, character, service",
      subheading: "An international school in the heart of Accra.",
      ctaLabel: "Apply for admission",
      ctaHref: "/site/admissions",
    },
  },
  {
    type: "richText",
    label: "Text section",
    description: "A heading and body copy.",
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "body", label: "Body", kind: "textarea" },
    ],
    defaults: { heading: "About the school", body: "" },
  },
  {
    type: "imageText",
    label: "Image and text",
    description: "An image beside a block of copy.",
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "body", label: "Body", kind: "textarea" },
      { key: "imageUrl", label: "Image", kind: "image" },
      { key: "imagePosition", label: "Image on", kind: "text", hint: "left or right" },
    ],
    defaults: { heading: "", body: "", imagePosition: "left" },
  },
  {
    type: "gallery",
    label: "Photo gallery",
    description: "A grid of images.",
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "images",
        label: "Image URLs",
        kind: "list",
        hint: "One URL per line",
      },
    ],
    defaults: { heading: "School life", images: "" },
  },
  {
    type: "cards",
    label: "Card row",
    description: "Three or more linked cards — programmes, departments, news.",
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "items",
        label: "Cards",
        kind: "list",
        hint: "One per line: Title | Description | Link",
      },
    ],
    defaults: { heading: "What we offer", items: "" },
  },
  {
    type: "stats",
    label: "Key figures",
    description: "Numbers the school wants to lead with.",
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "items",
        label: "Figures",
        kind: "list",
        hint: "One per line: Value | Label",
      },
    ],
    defaults: {
      heading: "",
      items: "1,200 | Students\n85 | Teachers\n98% | WASSCE pass rate",
    },
  },
  {
    type: "quote",
    label: "Quote",
    description: "A testimonial from a parent, student or alumnus.",
    fields: [
      { key: "quote", label: "Quote", kind: "textarea" },
      { key: "attribution", label: "Attributed to", kind: "text" },
    ],
    defaults: { quote: "", attribution: "" },
  },
  {
    type: "cta",
    label: "Call to action",
    description: "A band with a single clear action.",
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "body", label: "Supporting text", kind: "textarea" },
      { key: "ctaLabel", label: "Button text", kind: "text" },
      { key: "ctaHref", label: "Button link", kind: "url" },
    ],
    defaults: {
      heading: "Admissions are open",
      ctaLabel: "Start an application",
      ctaHref: "/site/admissions",
    },
  },
  {
    type: "contact",
    label: "Contact details",
    description: "Address, phone, email and opening hours.",
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "address", label: "Address", kind: "textarea" },
      { key: "phone", label: "Phone", kind: "text" },
      { key: "email", label: "Email", kind: "text" },
      { key: "hours", label: "Opening hours", kind: "text" },
    ],
    defaults: { heading: "Visit us" },
  },
  {
    type: "news",
    label: "Latest announcements",
    description: "Pulls the school's published announcements automatically.",
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "count", label: "How many", kind: "text" },
    ],
    defaults: { heading: "School news", count: "3" },
  },
];

export function blockDef(type: string): BlockDef | undefined {
  return BLOCK_DEFS.find((def) => def.type === type);
}

/**
 * Parses a list of rows out of whatever is stored on the block.
 *
 * The editor writes "a | b | c" lines, but page JSON is untrusted input — it
 * may predate the editor, or have been written by an earlier version with a
 * different shape. A public website must not 500 because a block holds an
 * array where a string was expected, so every plausible shape is accepted and
 * anything unrecognisable yields no rows.
 *
 * `keys` gives the column order when entries are objects, since {label, value}
 * and {value, label} are indistinguishable without it.
 */
export function parseRows(value: unknown, keys?: string[]): string[][] {
  if (!value) return [];

  const cells = (entry: unknown): string[] => {
    if (typeof entry === "string") {
      return entry.split("|").map((cell) => cell.trim());
    }
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const order = keys ?? Object.keys(record);
      return order.map((key) => String(record[key] ?? "").trim());
    }
    return [String(entry ?? "").trim()];
  };

  if (Array.isArray(value)) {
    return value.map(cells).filter((row) => row.some(Boolean));
  }

  if (typeof value === "string") {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split("|").map((cell) => cell.trim()));
  }

  return [];
}

/** Reads a block prop as a string, whatever JSON actually holds. */
export function propText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function parseBlocks(value: unknown): Block[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Block =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as Block).type === "string",
    )
    .map((entry) => ({
      id: String(entry.id ?? Math.random().toString(36).slice(2)),
      type: entry.type,
      props: (entry.props ?? {}) as Record<string, string>,
    }));
}
