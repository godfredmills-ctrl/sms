import type { Dataset, Field, ReportRow } from "@/lib/reporting";

/**
 * What a report actually says, as opposed to what it lists.
 *
 * A table of four hundred rows is data, not a report. Nobody reads it: a
 * head teacher wants the three numbers at the top, a bursar wants to know
 * which class holds the arrears, and both want to be told when a quarter of
 * the rows are missing a phone number. So this derives the analysis — key
 * figures, breakdowns, distributions and gaps — from the rows and the
 * dataset's own field types, and the renderers present it above the table.
 *
 * Everything here is pure and browser-safe: the same summary drives the PDF
 * and the screen, so the paper cannot disagree with the page.
 */

export type NumericSummary = {
  key: string;
  label: string;
  type: Field["type"];
  /** Rows that carried a usable number. */
  count: number;
  total: number;
  /**
   * The figure worth putting in large type, and what to call it.
   *
   * Summing a percentage produces nonsense — forty attendance rates added up
   * read "3,706%" — so a rate leads with its average and a money column with
   * its total.
   */
  headline: number;
  headlineLabel: "Total" | "Average";
  mean: number;
  median: number;
  min: number;
  max: number;
};

export type BreakdownRow = {
  value: string;
  count: number;
  /** Share of all rows, 0–100. */
  percent: number;
  /** The measure summed within this group, when there is one worth summing. */
  measure?: number;
};

export type Breakdown = {
  key: string;
  label: string;
  rows: BreakdownRow[];
  /** How many groups were left out of `rows`. */
  otherCount: number;
  measureKey?: string;
  measureLabel?: string;
  measureType?: Field["type"];
};

export type Completeness = {
  key: string;
  label: string;
  filled: number;
  total: number;
  /** 0–100. */
  percent: number;
};

export type ReportSummary = {
  rowCount: number;
  numerics: NumericSummary[];
  breakdowns: Breakdown[];
  /** Only fields that are actually incomplete, worst first. */
  gaps: Completeness[];
};

const NUMERIC_TYPES: Array<Field["type"]> = ["number", "money", "percent"];

/** A cell that carries no information. */
function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return text === "" || text === "-";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  // Tolerates what a dataset may already have formatted: "GH₵1,250.00", "88%".
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Columns that name a person or a record rather than describing one. Even
 * where they repeat enough to look like categories in a small sample, a
 * breakdown "by name" tells a reader nothing they did not already have.
 *
 * Matched on whole words, so "Provider" is not mistaken for an id and
 * "Nationality" is not mistaken for a name.
 */
const IDENTITY_WORDS = new Set([
  "name",
  "names",
  "no",
  "number",
  "id",
  "code",
  "phone",
  "mobile",
  "telephone",
  "email",
  "address",
  "reference",
  "serial",
]);

function looksLikeIdentity(text: string): boolean {
  return text
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .some((word) => IDENTITY_WORDS.has(word.toLowerCase()));
}

/**
 * Whether a field is worth grouping by.
 *
 * A column with a distinct value on nearly every row — a name, an admission
 * number — makes a four-hundred-row "breakdown" that says nothing. A column
 * with one value says nothing either. What is useful sits in between: class,
 * status, house, gender, payment method.
 */
function isGroupable(field: Field, rows: ReportRow[]): boolean {
  if (field.type !== "tag" && field.type !== "text") return false;
  // A tag is declared as a category, so it is trusted even when it is called
  // "Status code"; free text has to earn it and must not be an identity.
  if (field.type === "text" && (looksLikeIdentity(field.label) || looksLikeIdentity(field.key))) {
    return false;
  }

  const values = new Set<string>();
  let filled = 0;
  for (const row of rows) {
    const value = row[field.key];
    if (isBlank(value)) continue;
    filled += 1;
    values.add(String(value).trim());
    // Bail early on obviously unique columns rather than building a huge set.
    if (values.size > 40) return false;
  }

  if (values.size < 2 || !filled) return false;
  // A tag column is meant for grouping; a free-text one has to earn it by
  // repeating enough to be a category rather than a label.
  const repetition = filled / values.size;
  return field.type === "tag" ? true : repetition >= 3;
}

export function summariseReport(
  rows: ReportRow[],
  dataset: Dataset,
  columnKeys: string[],
): ReportSummary {
  const fields = (
    columnKeys.length
      ? dataset.fields.filter((field) => columnKeys.includes(field.key))
      : dataset.fields
  ).slice(0, 24);

  // --- Key figures ---------------------------------------------------------
  const numerics: NumericSummary[] = [];
  for (const field of fields) {
    if (!NUMERIC_TYPES.includes(field.type)) continue;

    const values: number[] = [];
    for (const row of rows) {
      const parsed = toNumber(row[field.key]);
      if (parsed !== null) values.push(parsed);
    }
    if (!values.length) continue;

    const sorted = [...values].sort((a, b) => a - b);
    const total = values.reduce((sum, value) => sum + value, 0);

    const mean = total / values.length;
    const isRate = field.type === "percent";

    numerics.push({
      key: field.key,
      label: field.label,
      type: field.type,
      count: values.length,
      total,
      headline: isRate ? mean : total,
      headlineLabel: isRate ? "Average" : "Total",
      mean,
      median: median(sorted),
      min: sorted[0],
      max: sorted[sorted.length - 1],
    });
  }

  // The measure a breakdown is worth summing: money first, because "arrears
  // by class" is the question a bursar actually asks, then any other number.
  const measureField =
    fields.find((field) => field.type === "money") ??
    fields.find((field) => field.type === "number");

  // --- Breakdowns ----------------------------------------------------------
  const breakdowns: Breakdown[] = [];
  for (const field of fields) {
    if (!isGroupable(field, rows)) continue;

    const groups = new Map<string, { count: number; measure: number }>();
    for (const row of rows) {
      const raw = row[field.key];
      const value = isBlank(raw) ? "Not recorded" : String(raw).trim();
      const entry = groups.get(value) ?? { count: 0, measure: 0 };
      entry.count += 1;
      if (measureField) {
        entry.measure += toNumber(row[measureField.key]) ?? 0;
      }
      groups.set(value, entry);
    }

    const ordered = [...groups.entries()]
      .map(([value, entry]) => ({
        value,
        count: entry.count,
        percent: rows.length ? (entry.count / rows.length) * 100 : 0,
        ...(measureField && entry.measure ? { measure: entry.measure } : {}),
      }))
      .sort((a, b) => b.count - a.count);

    const shown = ordered.slice(0, 10);
    breakdowns.push({
      key: field.key,
      label: field.label,
      rows: shown,
      otherCount: ordered.length - shown.length,
      ...(measureField && shown.some((row) => row.measure)
        ? {
            measureKey: measureField.key,
            measureLabel: measureField.label,
            measureType: measureField.type,
          }
        : {}),
    });

    // Four breakdowns is a page. Beyond that a reader stops reading, and the
    // detail table below answers anything more specific.
    if (breakdowns.length === 4) break;
  }

  // --- Gaps ----------------------------------------------------------------
  // What the report could not tell you, which is often the finding: a class
  // list where a fifth of the guardians have no phone number is a job, not a
  // footnote.
  const gaps: Completeness[] = [];
  for (const field of fields) {
    if (!rows.length) break;
    let filled = 0;
    for (const row of rows) {
      if (!isBlank(row[field.key])) filled += 1;
    }
    if (filled === rows.length) continue;
    gaps.push({
      key: field.key,
      label: field.label,
      filled,
      total: rows.length,
      percent: (filled / rows.length) * 100,
    });
  }
  gaps.sort((a, b) => a.percent - b.percent);

  return {
    rowCount: rows.length,
    numerics,
    breakdowns,
    gaps: gaps.slice(0, 6),
  };
}

/** Formats a summary figure the way its field type reads. */
export function formatMeasure(value: number, type: Field["type"]): string {
  if (type === "money") {
    // Pesewas are stored as integers upstream, but a dataset may already have
    // divided; either way the figure is shown to two decimals with a symbol.
    return `GH₵${value.toLocaleString("en-GH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (type === "percent") {
    return `${value.toLocaleString("en-GH", { maximumFractionDigits: 1 })}%`;
  }
  return value.toLocaleString("en-GH", { maximumFractionDigits: 2 });
}
