import type { PortalType } from "@prisma/client";

/**
 * Who a fee reminder goes to.
 *
 * The list and the mapping live together, and both the rule form and the
 * reminder engine import from here. They previously kept their own copies of
 * these strings and disagreed: the form wrote "STUDENT" while the engine
 * compared against "STUDENTS", so a school choosing "the student" had
 * reminders delivered to guardians instead. Nothing failed — a reminder sent
 * to the wrong person still reports as sent — which is why it survived.
 *
 * Adding an option here now forces the mapping to be written at the same time.
 */
export type ReminderAudience =
  | "BILL_PAYERS"
  | "ALL_GUARDIANS"
  | "STUDENT"
  | "EVERYONE";

export const REMINDER_AUDIENCES: Array<{
  value: ReminderAudience;
  label: string;
  description: string;
  portals: PortalType[];
  billPayersOnly?: boolean;
}> = [
  {
    value: "BILL_PAYERS",
    label: "Bill payers only",
    description: "Guardians marked as responsible for the fees.",
    portals: ["GUARDIAN"],
    billPayersOnly: true,
  },
  {
    value: "ALL_GUARDIANS",
    label: "All guardians",
    description: "Every guardian linked to the student.",
    portals: ["GUARDIAN"],
  },
  {
    value: "STUDENT",
    label: "The student",
    description: "The student's own portal account.",
    portals: ["STUDENT"],
  },
  {
    value: "EVERYONE",
    label: "Guardians and student",
    description: "Both, with no duplicate messages.",
    portals: ["GUARDIAN", "STUDENT"],
  },
];

/**
 * Resolves an audience string to its recipient filter.
 *
 * Falls back to bill payers for anything unrecognised — the conservative
 * choice for a fee reminder, and what a school most likely meant.
 */
export function reminderAudienceFilter(audience: string): {
  portals: PortalType[];
  billPayersOnly?: boolean;
} {
  const match = REMINDER_AUDIENCES.find((entry) => entry.value === audience);
  if (match) {
    return { portals: match.portals, billPayersOnly: match.billPayersOnly };
  }

  // "STUDENTS" was an earlier spelling that never reached the database, but a
  // hand-edited rule could still carry it.
  if (audience === "STUDENTS") return { portals: ["STUDENT"] };

  return { portals: ["GUARDIAN"], billPayersOnly: true };
}
