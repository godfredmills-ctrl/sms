import type { Prisma } from "@prisma/client";

/**
 * Which guardians the school is allowed to reach, in one place.
 *
 * A guardian can be deactivated: they have moved abroad, separated from the
 * family, or died. The record stays, because they are on every invoice they
 * ever paid and on the child's family history. What stops is contact.
 *
 * That is easy to say and easy to get wrong, because "the guardians of this
 * student" is selected in about a dozen different queries written months
 * apart: the absence SMS, the fee reminder, the report card email, the
 * emergency contact printed on an ID card, the phone number on a trip
 * manifest, the salutation on an admission letter. Add a flag and honour it in
 * eleven of them, and the twelfth keeps working perfectly while doing the
 * wrong thing. Nothing errors. Nobody finds out until a school rings the
 * number on the manifest during an incident.
 *
 * So the filters live here and nowhere else, and `scripts/check-guardian-
 * contact.mjs` fails the build on any guardian selection that does not use
 * one. A query that genuinely wants everybody, including the deactivated, says
 * so with a `guardian-contact:` comment: an explicit decision instead of an
 * omission.
 *
 * Note how much of the damage is done by `take: 1`. Most of these queries want
 * one guardian, ordered so the primary comes first. A deactivated parent who
 * is still flagged primary sorts to the top and becomes the only contact the
 * school has, silently displacing the parent who is actually there.
 */

/** A guardian the school still treats as a contact. */
const CONTACTABLE: Prisma.GuardianWhereInput = { isActive: true };

export const guardianLinks = {
  /** Anyone still contactable, in whatever role. */
  any: { guardian: CONTACTABLE },

  /** The day-to-day point of contact. */
  primary: { guardian: CONTACTABLE, isPrimary: true },

  /** Rung first in an emergency. */
  emergency: { guardian: CONTACTABLE, isEmergency: true },

  /** Receives invoices and fee reminders. */
  billPayers: { guardian: CONTACTABLE, isBillPayer: true },

  /** Receives academic reports. */
  reportRecipients: { guardian: CONTACTABLE, receivesReports: true },
} satisfies Record<string, Prisma.StudentGuardianWhereInput>;

/**
 * What the school is told when a guardian is switched off.
 *
 * Free text would be a box people leave empty, and "why is this parent
 * inactive" is the first question the next member of staff asks. A short list
 * covers what actually happens, with an "other" that then requires a note.
 */
export const DEACTIVATION_REASONS = [
  { value: "NO_LONGER_GUARDIAN", label: "No longer the guardian" },
  { value: "MOVED_AWAY", label: "Moved away or unreachable" },
  { value: "SEPARATED", label: "Separated from the family" },
  { value: "DECEASED", label: "Deceased" },
  { value: "DUPLICATE", label: "Duplicate record" },
  { value: "OTHER", label: "Other" },
] as const;

export type DeactivationReason = (typeof DEACTIVATION_REASONS)[number]["value"];

/** The stored reason, written out for a screen. */
export function describeDeactivation(reason: string | null): string {
  if (!reason) return "No reason recorded";
  const known = DEACTIVATION_REASONS.find((entry) => entry.value === reason);
  if (known) return known.label;
  // Anything else is the free note typed against "Other".
  return reason;
}
