/**
 * The library's rules, in one place.
 *
 * Loan length, borrowing limits, what counts as overdue and what a copy's
 * status means are asked by the issue desk, the catalogue, the student
 * record and the pupil's own portal. Written out separately in each, they
 * would drift — the desk would refuse a fourth book while the portal said
 * three were allowed, and neither screen would be wrong about itself.
 */

export const LOAN_DAYS = {
  /** A fortnight: long enough to finish a reader, short enough to circulate. */
  STUDENT: 14,
  /** Staff keep a set text for the term; they are also easier to find. */
  STAFF: 42,
} as const;

export const LOAN_LIMIT = {
  STUDENT: 3,
  STAFF: 10,
} as const;

/** How many times a loan may be extended before the book must come back. */
export const MAX_RENEWALS = 2;

export const ITEM_CATEGORIES = [
  { value: "FICTION", label: "Fiction" },
  { value: "NON_FICTION", label: "Non-fiction" },
  { value: "TEXTBOOK", label: "Textbook" },
  { value: "REFERENCE", label: "Reference" },
  { value: "PERIODICAL", label: "Periodical" },
  { value: "PAST_PAPER", label: "Past papers" },
  { value: "MEDIA", label: "Media" },
] as const;

export const COPY_STATUSES = [
  { value: "AVAILABLE", label: "On the shelf" },
  { value: "ON_LOAN", label: "On loan" },
  { value: "REPAIR", label: "Being repaired" },
  { value: "LOST", label: "Lost" },
  { value: "WITHDRAWN", label: "Withdrawn" },
] as const;

export const CONDITIONS = [
  { value: "NEW", label: "New" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "POOR", label: "Poor" },
] as const;

/**
 * Reference books do not leave the room. It is the whole point of a reference
 * section, and a librarian should not have to remember it for each atlas.
 */
export const NON_CIRCULATING: ReadonlySet<string> = new Set(["REFERENCE", "PERIODICAL"]);

export function labelFor(
  list: ReadonlyArray<{ value: string; label: string }>,
  value: string,
): string {
  const match = list.find((entry) => entry.value === value);
  if (match) return match.label;
  const words = value.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The date a loan issued now would fall due.
 *
 * Set to the end of that day rather than the same clock time: a book issued at
 * 2pm and brought back at 9am on the due date is not late, and a borrower
 * should never be shown as overdue for a few hours.
 */
export function dueDateFor(borrower: "STUDENT" | "STAFF", from = new Date()): Date {
  const due = new Date(from);
  due.setDate(due.getDate() + LOAN_DAYS[borrower]);
  due.setHours(23, 59, 59, 999);
  return due;
}

/**
 * Whole days a loan is past its due date. Zero when it is not.
 *
 * Both dates are floored to midnight before subtracting, so the answer is a
 * count of calendar days and cannot be shifted by the hour of day the page
 * happens to be rendered.
 */
export function daysOverdue(dueAt: Date, asOf = new Date()): number {
  const due = new Date(dueAt);
  due.setHours(0, 0, 0, 0);
  const now = new Date(asOf);
  now.setHours(0, 0, 0, 0);
  const days = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
  return days > 0 ? days : 0;
}

export type BorrowerKind = "STUDENT" | "STAFF";

/**
 * Whether this borrower may take another book, and why not when they may not.
 *
 * Returns a sentence rather than a boolean because every caller needs to
 * explain the refusal, and three callers writing three explanations is how a
 * pupil gets told "not allowed" with nothing they can act on.
 */
export function loanRefusal(input: {
  borrower: BorrowerKind;
  /** Live loans the borrower already has. */
  openLoans: number;
  /** How many of those are past their due date. */
  overdueLoans: number;
  /** The category of the item being borrowed. */
  category: string;
  /** The copy's status right now. */
  copyStatus: string;
}): string | null {
  if (NON_CIRCULATING.has(input.category)) {
    return "Reference and periodicals stay in the library — they cannot be borrowed.";
  }
  if (input.copyStatus === "ON_LOAN") {
    return "That copy is already out with someone else.";
  }
  if (input.copyStatus === "LOST" || input.copyStatus === "WITHDRAWN") {
    return "That copy is no longer on the shelf.";
  }
  if (input.copyStatus === "REPAIR") {
    return "That copy is being repaired.";
  }
  if (input.overdueLoans > 0) {
    return `They have ${input.overdueLoans} overdue ${
      input.overdueLoans === 1 ? "book" : "books"
    }. Take those back first.`;
  }
  if (input.openLoans >= LOAN_LIMIT[input.borrower]) {
    return `That is already ${input.openLoans} on loan — the limit is ${
      LOAN_LIMIT[input.borrower]
    }.`;
  }
  return null;
}
