import type { Tone } from "@/components/ui";

/**
 * What an expense can be, what it can become, and what to call it.
 *
 * A plain module with no server-only import and no database access, because
 * three different kinds of caller need it: the server action that applies a
 * decision, the server component that decides which buttons to draw, and the
 * client table that renders the badge. If the page and the action disagree
 * about what may follow what, the result is a button that always fails — so
 * there is one list, here.
 *
 * (It is separate from lib/expenses.ts for the same reason the student
 * lifecycle is separate from its actions: a "use server" module may only
 * export async functions, and a server-only module cannot be imported by a
 * client component at all.)
 */

export const EXPENSE_STATUSES = [
  {
    value: "PENDING",
    label: "Awaiting approval",
    tone: "warning",
    description: "Recorded, and waiting for somebody who can approve it.",
  },
  {
    value: "APPROVED",
    label: "Approved, unpaid",
    tone: "info",
    description: "The school has committed to paying this. It is owed.",
  },
  {
    value: "PAID",
    label: "Paid",
    tone: "success",
    description: "Settled, with a date and a method against it.",
  },
  {
    value: "REJECTED",
    label: "Turned down",
    tone: "danger",
    description: "Not approved. The reason is on the record.",
  },
  {
    value: "VOID",
    label: "Voided",
    tone: "neutral",
    description: "Entered in error. Kept, so its reference is never reused.",
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  tone: Tone;
  description: string;
}>;

export type ExpenseStatusValue = (typeof EXPENSE_STATUSES)[number]["value"];

/**
 * What each status may become.
 *
 * A paid bill is a record of money that has left the account, so it is voided
 * rather than un-paid: quietly reversing it would leave the statement
 * claiming the money is still there.
 */
export const EXPENSE_TRANSITIONS: Record<ExpenseStatusValue, ExpenseStatusValue[]> = {
  PENDING: ["APPROVED", "REJECTED", "VOID"],
  APPROVED: ["PAID", "REJECTED", "VOID"],
  PAID: ["VOID"],
  REJECTED: ["PENDING", "VOID"],
  VOID: [],
};

export function canBecome(from: string, to: string): boolean {
  return Boolean(EXPENSE_TRANSITIONS[from as ExpenseStatusValue]?.includes(to as ExpenseStatusValue));
}

export function statusLabel(status: string): string {
  return EXPENSE_STATUSES.find((entry) => entry.value === status)?.label ?? status;
}

export const PAYMENT_METHODS = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "CASH", label: "Cash" },
] as const;

export const CATEGORY_KINDS = [
  {
    value: "OPERATING",
    label: "Operating",
    description: "The running of the school: utilities, materials, upkeep.",
  },
  {
    value: "CAPITAL",
    label: "Capital",
    description: "Something that lasts: a building, a bus, equipment.",
  },
  {
    value: "STAFF",
    label: "Staff",
    description: "Paid to or for staff outside the payroll run: training, allowances.",
  },
] as const;
