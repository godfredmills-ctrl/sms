/**
 * The website block catalogue.
 *
 * One list drives three things: the palette the editor offers, the fields each
 * block's form shows, and the shape the public renderer expects. Keeping them
 * in one file is what stops the editor writing props the renderer never reads
 * — which has happened, and looked like a broken website rather than a stale
 * catalogue.
 *
 * List fields hold one entry per line, with cells divided by " | ". That is a
 * shape a school secretary can edit in a plain textarea, and `parseRows`
 * tolerates the other shapes JSON has historically stored.
 */

export type BlockType =
  | "hero"
  | "features"
  | "richText"
  | "imageText"
  | "gallery"
  | "cards"
  | "stats"
  | "quote"
  | "cta"
  | "contact"
  | "news"
  | "admissionForm";

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
    description:
      "The opening statement: a two-tone headline, supporting text, buttons and a photograph.",
    fields: [
      { key: "heading", label: "Headline", kind: "text" },
      {
        key: "headingAccent",
        label: "Headline second line",
        kind: "text",
        hint: "Rendered in the accent colour.",
      },
      { key: "subheading", label: "Supporting text", kind: "textarea" },
      { key: "imageUrl", label: "Photograph", kind: "image" },
      { key: "ctaLabel", label: "Button text", kind: "text" },
      { key: "ctaHref", label: "Button link", kind: "url" },
      { key: "secondaryCtaLabel", label: "Second button text", kind: "text" },
      { key: "secondaryCtaHref", label: "Second button link", kind: "url" },
      {
        key: "badgeTitle",
        label: "Badge heading",
        kind: "text",
        hint: "The small card over the photograph: e.g. “A Legacy of Excellence”.",
      },
      { key: "badgeText", label: "Badge detail", kind: "text", hint: "e.g. “Since 1998”." },
    ],
    defaults: {
      heading: "Inspiring Minds.",
      headingAccent: "Shaping Futures.",
      subheading:
        "A nurturing environment where students learn, grow, and thrive to become tomorrow's leaders.",
      ctaLabel: "Discover our school",
      ctaHref: "/site/about",
      secondaryCtaLabel: "Apply for admission",
      secondaryCtaHref: "/site/admissions",
      badgeTitle: "A Legacy of Excellence",
      badgeText: "Since 2011",
    },
  },
  {
    type: "features",
    label: "Feature band",
    description: "A dark band of the school's strengths, three to five across.",
    fields: [
      {
        key: "items",
        label: "Features",
        kind: "list",
        hint: "One per line: Title | Description",
      },
    ],
    defaults: {
      items:
        "Holistic Education | Nurturing academic, emotional and social growth.\nExpert Educators | Passionate teachers dedicated to excellence.\nInnovative Learning | Modern facilities and creative teaching methods.\nGlobal Perspective | Preparing students for a global future.\nSafe & Supportive Campus | A secure environment where every child thrives.",
    },
  },
  {
    type: "richText",
    label: "Text section",
    description: "A heading and body copy.",
    fields: [
      { key: "eyebrow", label: "Eyebrow", kind: "text", hint: "The small label above the heading." },
      { key: "heading", label: "Heading", kind: "text" },
      { key: "body", label: "Body", kind: "textarea" },
    ],
    defaults: { eyebrow: "", heading: "About the school", body: "" },
  },
  {
    type: "imageText",
    label: "Image and text",
    description:
      "A photograph beside copy, with optional statistics and fact cards: the classic “about our school” section.",
    fields: [
      { key: "eyebrow", label: "Eyebrow", kind: "text", hint: "e.g. “ABOUT OUR SCHOOL”." },
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "headingAccent",
        label: "Heading second line",
        kind: "text",
        hint: "Rendered in the accent colour.",
      },
      { key: "body", label: "Body", kind: "textarea" },
      { key: "imageUrl", label: "Photograph", kind: "image" },
      { key: "imagePosition", label: "Image on", kind: "text", hint: "left or right" },
      { key: "ctaLabel", label: "Button text", kind: "text" },
      { key: "ctaHref", label: "Button link", kind: "url" },
      {
        key: "stats",
        label: "Statistics row",
        kind: "list",
        hint: "One per line: 25+ | Years of Excellence",
      },
      {
        key: "facts",
        label: "Fact cards beside the image",
        kind: "list",
        hint: "One per line: 15:1 | Student-Teacher Ratio",
      },
    ],
    defaults: { eyebrow: "", heading: "", headingAccent: "", body: "", imagePosition: "right" },
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
    description: "Linked cards with pictures: programmes, departments, houses.",
    fields: [
      { key: "eyebrow", label: "Eyebrow", kind: "text", hint: "e.g. “ACADEMICS”." },
      { key: "heading", label: "Heading", kind: "text" },
      { key: "intro", label: "Introduction", kind: "textarea" },
      {
        key: "items",
        label: "Cards",
        kind: "list",
        hint: "One per line: Title | Description | Link | Image URL | Tag",
      },
      { key: "ctaLabel", label: "Button under the cards", kind: "text" },
      { key: "ctaHref", label: "Button link", kind: "url" },
    ],
    defaults: { eyebrow: "", heading: "What we offer", intro: "", items: "" },
  },
  {
    type: "stats",
    label: "Key figures",
    description: "A dark band of the numbers the school leads with.",
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
      items:
        "25+ | Years of Excellence\n1,500+ | Students Enrolled\n120+ | Qualified Teachers\n98% | BECE pass rate",
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
    description:
      "A section with one clear action: with a photograph it becomes a split banner, without one a coloured band.",
    fields: [
      { key: "eyebrow", label: "Eyebrow", kind: "text", hint: "e.g. “ADMISSIONS”." },
      { key: "heading", label: "Heading", kind: "text" },
      { key: "body", label: "Supporting text", kind: "textarea" },
      { key: "imageUrl", label: "Photograph", kind: "image" },
      { key: "ctaLabel", label: "Button text", kind: "text" },
      { key: "ctaHref", label: "Button link", kind: "url" },
      { key: "secondaryCtaLabel", label: "Second button text", kind: "text" },
      { key: "secondaryCtaHref", label: "Second button link", kind: "url" },
    ],
    defaults: {
      eyebrow: "Admissions",
      heading: "Begin your journey toward a bright future",
      body: "Join a community where your child will be inspired, supported, and empowered to achieve their dreams.",
      ctaLabel: "Apply now",
      ctaHref: "/site/admissions",
      secondaryCtaLabel: "Contact the office",
      secondaryCtaHref: "/site/contact",
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
      { key: "eyebrow", label: "Eyebrow", kind: "text" },
      { key: "heading", label: "Heading", kind: "text" },
      { key: "count", label: "How many", kind: "text" },
    ],
    defaults: { eyebrow: "News & events", heading: "School news", count: "3" },
  },
  {
    type: "admissionForm",
    label: "Admission enquiry form",
    description:
      "Prospective parents apply from the website. Submissions land in Website → Enquiries for the admissions office to follow up.",
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "intro", label: "Introduction", kind: "textarea" },
      {
        key: "levels",
        label: "Levels offered",
        kind: "list",
        hint: "One per line: Nursery, KG, Primary, JHS…",
      },
      { key: "thanks", label: "Thank-you message", kind: "textarea" },
    ],
    defaults: {
      heading: "Apply for admission",
      intro:
        "Tell us about your child and we will be in touch within two school days.",
      levels: "Nursery\nKindergarten\nLower Primary\nUpper Primary\nJHS",
      thanks:
        "Thank you: your enquiry has been received. The admissions office will contact you shortly.",
    },
  },
];

export function blockDef(type: string): BlockDef | undefined {
  return BLOCK_DEFS.find((entry) => entry.type === type);
}

/**
 * Reads a "rows" prop, whatever shape JSON actually holds.
 *
 * The editor writes newline-delimited "a | b" strings; older pages carried an
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
