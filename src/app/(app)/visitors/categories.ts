/**
 * What kind of visitor someone is.
 *
 * A plain module, deliberately: this list is read by the sign-in form (a
 * client component) and by the server action that validates what the form
 * sent. Its previous home was actions.ts, which carries "use server" — and
 * a "use server" module may only export async functions, so exporting an
 * array from it compiled, type-checked, built, and then threw
 * "A 'use server' file can only export async functions, found object"
 * the first time anyone opened the page.
 *
 * One list rather than two. The form used to keep its own copy with the
 * labels attached, so a category could be offered by the form and rejected
 * by the action with nothing to show that they had drifted apart.
 */
export const VISITOR_CATEGORIES = [
  { value: "PARENT", label: "Parent or guardian" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "INSPECTOR", label: "Inspector or official" },
  { value: "SUPPLIER", label: "Supplier or delivery" },
  { value: "GUEST", label: "Guest" },
  { value: "OTHER", label: "Other" },
] as const;

export type VisitorCategory = (typeof VISITOR_CATEGORIES)[number]["value"];

/** The fallback is GUEST: an unrecognised category is still a person at the desk. */
export function normaliseCategory(raw: string): VisitorCategory {
  const upper = raw.trim().toUpperCase();
  const match = VISITOR_CATEGORIES.find((entry) => entry.value === upper);
  return match ? match.value : "GUEST";
}

/** PARENT -> "Parent or guardian", for anything printed or listed. */
export function categoryLabel(value: string): string {
  const match = VISITOR_CATEGORIES.find((entry) => entry.value === value);
  if (match) return match.label;
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
