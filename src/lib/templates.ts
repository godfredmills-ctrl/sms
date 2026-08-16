/**
 * Document template model for transcripts, certificates and letters.
 *
 * A template is either UPLOAD (the school's own PDF, with fields positioned on
 * top of it) or BUILDER (elements laid out on a blank page in the app). Both
 * end up as the same list of absolutely positioned elements, so the renderer
 * only has to understand one shape.
 *
 * Positions are percentages of the page, not millimetres. That way A4 and
 * Letter, portrait and landscape all render from one layout without the school
 * having to re-place every field when they change paper size.
 */

export type ElementType = "text" | "field" | "image" | "line" | "box" | "qr";

export type TemplateElement = {
  id: string;
  type: ElementType;
  /** Percentage of page width / height, 0-100. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Literal text, or a binding path for `field`. */
  value: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  align: "left" | "center" | "right";
  colour: string;
  italic?: boolean;
  letterSpacing?: number;
};

export type TemplateLayout = {
  backgroundUrl?: string;
  backgroundColour?: string;
  elements: TemplateElement[];
};

/** The data paths a template may bind to, grouped for the picker. */
export const BINDINGS: Array<{
  group: string;
  items: Array<{ path: string; label: string; example: string }>;
}> = [
  {
    group: "Student",
    items: [
      { path: "student.fullName", label: "Full name", example: "Ama Serwaa Boateng" },
      { path: "student.firstName", label: "First name", example: "Ama" },
      { path: "student.lastName", label: "Surname", example: "Boateng" },
      { path: "student.admissionNo", label: "Admission number", example: "ADM/2026/0417" },
      { path: "student.dateOfBirth", label: "Date of birth", example: "14 March 2009" },
      { path: "student.className", label: "Class", example: "JHS 3 Gold" },
      { path: "student.photoUrl", label: "Photograph", example: "" },
    ],
  },
  {
    group: "School",
    items: [
      { path: "school.name", label: "School name", example: "Accra International School" },
      { path: "school.motto", label: "Motto", example: "Knowledge and Service" },
      { path: "school.address", label: "Address", example: "PO Box 1234, Accra" },
      { path: "school.logoUrl", label: "Logo", example: "" },
      { path: "school.crestUrl", label: "Crest", example: "" },
    ],
  },
  {
    group: "Document",
    items: [
      { path: "document.title", label: "Title", example: "Certificate of Completion" },
      { path: "document.serialNumber", label: "Serial number", example: "CERT-2026-0031" },
      { path: "document.issuedOn", label: "Date issued", example: "15 August 2026" },
      { path: "document.awardedFor", label: "Awarded for", example: "Outstanding service" },
      { path: "document.verifyCode", label: "Verification code", example: "K3M9-2QX7" },
      { path: "document.signedBy", label: "Signatory", example: "Dr Kwame Mensah" },
      { path: "document.signatoryTitle", label: "Signatory title", example: "Head Teacher" },
    ],
  },
  {
    group: "Academic",
    items: [
      { path: "academic.cumulativeGpa", label: "Cumulative GPA", example: "3.72" },
      { path: "academic.classification", label: "Classification", example: "Distinction" },
      { path: "academic.totalCredits", label: "Total credits", example: "48" },
      { path: "academic.resultsTable", label: "Results table", example: "(the full table)" },
    ],
  },
];

export const TEMPLATE_KINDS = [
  { value: "CERTIFICATE", label: "Certificate" },
  { value: "TRANSCRIPT", label: "Transcript" },
  { value: "REPORT_CARD", label: "Report card" },
  { value: "ID_CARD", label: "ID card" },
  { value: "LETTER", label: "Letter" },
];

/** A blank certificate that is immediately usable rather than an empty page. */
export function starterLayout(kind: string): TemplateLayout {
  if (kind === "CERTIFICATE") {
    return {
      backgroundColour: "#ffffff",
      elements: [
        el("logo", "field", 44, 6, 12, 10, "school.logoUrl", { type: "image" }),
        el("school", "field", 10, 18, 80, 6, "school.name", {
          fontSize: 20,
          fontWeight: "bold",
          align: "center",
        }),
        el("motto", "field", 10, 24, 80, 4, "school.motto", {
          fontSize: 10,
          align: "center",
          italic: true,
          colour: "#64748b",
        }),
        el("title", "field", 10, 34, 80, 8, "document.title", {
          fontSize: 28,
          fontWeight: "bold",
          align: "center",
          letterSpacing: 2,
        }),
        el("presented", "text", 10, 45, 80, 4, "This is to certify that", {
          fontSize: 11,
          align: "center",
          colour: "#64748b",
        }),
        el("name", "field", 10, 50, 80, 8, "student.fullName", {
          fontSize: 24,
          fontWeight: "bold",
          align: "center",
        }),
        el("rule", "line", 25, 59, 50, 0.3, "", { colour: "#cbd5e1" }),
        el("reason", "field", 15, 63, 70, 8, "document.awardedFor", {
          fontSize: 12,
          align: "center",
        }),
        el("date", "field", 10, 82, 35, 4, "document.issuedOn", {
          fontSize: 10,
          align: "center",
        }),
        el("signatory", "field", 55, 82, 35, 4, "document.signedBy", {
          fontSize: 10,
          align: "center",
        }),
        el("dateLabel", "text", 10, 86, 35, 3, "Date", {
          fontSize: 8,
          align: "center",
          colour: "#94a3b8",
        }),
        el("signLabel", "field", 55, 86, 35, 3, "document.signatoryTitle", {
          fontSize: 8,
          align: "center",
          colour: "#94a3b8",
        }),
        el("serial", "field", 10, 93, 40, 3, "document.serialNumber", {
          fontSize: 8,
          colour: "#94a3b8",
        }),
        el("qr", "qr", 84, 88, 8, 8, "document.verifyCode", {}),
      ],
    };
  }

  return {
    backgroundColour: "#ffffff",
    elements: [
      el("school", "field", 10, 6, 80, 5, "school.name", {
        fontSize: 16,
        fontWeight: "bold",
        align: "center",
      }),
      el("title", "field", 10, 12, 80, 5, "document.title", {
        fontSize: 13,
        align: "center",
        letterSpacing: 1,
      }),
      el("nameLabel", "text", 10, 22, 20, 4, "Name", { fontSize: 9, colour: "#64748b" }),
      el("name", "field", 30, 22, 60, 4, "student.fullName", {
        fontSize: 11,
        fontWeight: "bold",
      }),
      el("admLabel", "text", 10, 27, 20, 4, "Admission no.", {
        fontSize: 9,
        colour: "#64748b",
      }),
      el("adm", "field", 30, 27, 60, 4, "student.admissionNo", { fontSize: 11 }),
      el("results", "field", 10, 36, 80, 45, "academic.resultsTable", { fontSize: 9 }),
      el("serial", "field", 10, 92, 40, 3, "document.serialNumber", {
        fontSize: 8,
        colour: "#94a3b8",
      }),
      el("qr", "qr", 84, 88, 8, 8, "document.verifyCode", {}),
    ],
  };
}

function el(
  id: string,
  type: ElementType,
  x: number,
  y: number,
  width: number,
  height: number,
  value: string,
  overrides: Partial<TemplateElement> = {},
): TemplateElement {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    value,
    fontSize: 12,
    fontWeight: "normal",
    align: "left",
    colour: "#0f172a",
    ...overrides,
  };
}

export function parseLayout(value: unknown): TemplateLayout {
  if (!value || typeof value !== "object") return { elements: [] };
  const layout = value as TemplateLayout;
  return {
    backgroundUrl: layout.backgroundUrl,
    backgroundColour: layout.backgroundColour ?? "#ffffff",
    elements: Array.isArray(layout.elements) ? layout.elements : [],
  };
}

/** Resolves a binding path against a merge context, e.g. "student.fullName". */
export function resolveBinding(
  path: string,
  context: Record<string, unknown>,
): string {
  const value = path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      context,
    );

  if (value === null || value === undefined) return "";
  return String(value);
}
