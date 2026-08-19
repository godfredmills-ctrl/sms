/**
 * What a student's record can become, and what each transition means.
 *
 * A plain module, deliberately: this list is read by lifecycle-card.tsx (a
 * client component) and by the server action that applies the change. It
 * used to live in actions.ts, which carries "use server" — and such a module
 * may only export async functions, so exporting an array from it compiled,
 * type-checked, built, and then threw
 * "A 'use server' file can only export async functions, found object"
 * at whoever opened the page.
 */
export const LIFECYCLE_TRANSITIONS = [
  {
    value: "ON_LEAVE",
    label: "On leave",
    description:
      "Away for a while and expected back. Keeps their class place, but comes out of the headcount and the next billing run.",
    endsEnrolment: false,
  },
  {
    value: "SUSPENDED",
    label: "Suspended",
    description:
      "Excluded temporarily. Keeps their class place, but comes out of the headcount and the next billing run.",
    endsEnrolment: false,
  },
  {
    value: "WITHDRAWN",
    label: "Withdrawn",
    description: "Taken out of the school by the family. Leaves the roll and billing.",
    endsEnrolment: true,
  },
  {
    value: "TRANSFERRED_OUT",
    label: "Transferred out",
    description: "Moved to another school. Leaves the roll and billing.",
    endsEnrolment: true,
  },
  {
    value: "ENROLLED",
    label: "Reinstate as enrolled",
    description: "Back on the roll, on the register, and billed again.",
    endsEnrolment: false,
  },
] as const;
