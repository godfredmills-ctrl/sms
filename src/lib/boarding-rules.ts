import type { Tone } from "@/components/ui";

/**
 * The rules of boarding: who may sleep where, and what an exeat can become.
 *
 * Pure, client-safe and with no database import, because the page that draws
 * the buttons and the action that carries them out both need these and must
 * not disagree — a button that appears and then fails is this codebase's most
 * frequent complaint about itself.
 */

export const EXEAT_STATUSES = [
  {
    value: "REQUESTED",
    label: "Waiting on approval",
    tone: "warning",
    description: "Asked for. Nobody has decided yet, and the gate will not release them.",
  },
  {
    value: "APPROVED",
    label: "Approved, still here",
    tone: "info",
    description: "Cleared to go. The gate can sign them out.",
  },
  {
    value: "OUT",
    label: "Off the premises",
    tone: "danger",
    description: "Signed out. The school does not have this child.",
  },
  {
    value: "RETURNED",
    label: "Back",
    tone: "success",
    description: "Signed in at the gate.",
  },
  {
    value: "CANCELLED",
    label: "Not going",
    tone: "neutral",
    description: "Turned down, or withdrawn before they left.",
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  tone: Tone;
  description: string;
}>;

export type ExeatStatusValue = (typeof EXEAT_STATUSES)[number]["value"];

/**
 * What each state may become.
 *
 * RETURNED is terminal. A child who has been signed back in and then needs to
 * go out again is a second leave-out with its own reason, its own approval and
 * its own person at the gate — reusing the row would overwrite the record of
 * the first one, and the record is the entire point.
 */
export const EXEAT_TRANSITIONS: Record<ExeatStatusValue, ExeatStatusValue[]> = {
  REQUESTED: ["APPROVED", "CANCELLED"],
  APPROVED: ["OUT", "CANCELLED"],
  OUT: ["RETURNED"],
  RETURNED: [],
  CANCELLED: [],
};

export function canBecome(from: string, to: string): boolean {
  return Boolean(
    EXEAT_TRANSITIONS[from as ExeatStatusValue]?.includes(to as ExeatStatusValue),
  );
}

export function exeatLabel(status: string): string {
  return EXEAT_STATUSES.find((entry) => entry.value === status)?.label ?? status;
}

/**
 * Whether a child who is out is late back.
 *
 * Derived rather than stored, because a stored flag is only as true as the
 * last job that ran, and this is the figure somebody looks at when a parent
 * has not answered the phone. `now` is passed in so it can be tested and so
 * the server and the browser cannot disagree about the hour.
 */
export function isOverdue(
  exeat: { status: string; dueBackAt: Date | string },
  now: Date,
): boolean {
  if (exeat.status !== "OUT") return false;
  const due = typeof exeat.dueBackAt === "string" ? new Date(exeat.dueBackAt) : exeat.dueBackAt;
  return due.getTime() < now.getTime();
}

export const BOARDING_GENDERS = [
  { value: "BOYS", label: "Boys" },
  { value: "GIRLS", label: "Girls" },
  { value: "MIXED", label: "Mixed" },
] as const;

/**
 * Whether a child may sleep in a house, by sex.
 *
 * A plain refusal for the clear mismatch, and silence otherwise. OTHER and
 * UNDISCLOSED are deliberately not refused: a school that has recorded a
 * child's sex as either has already decided something this function is not
 * entitled to overrule, and a refusal here would be a piece of software
 * telling a housemistress she may not place a child she has met.
 */
export function houseRefusal(
  studentGender: string | null | undefined,
  houseGender: string,
): string | null {
  if (houseGender === "MIXED") return null;
  if (studentGender === "MALE" && houseGender === "GIRLS") {
    return "This is a girls' house.";
  }
  if (studentGender === "FEMALE" && houseGender === "BOYS") {
    return "This is a boys' house.";
  }
  return null;
}

/**
 * Whether a room has a bed spare.
 *
 * Capacity means beds. A dormitory that sleeps eight is eight, whatever the
 * floor would hold — the free-text fields this replaced routinely said
 * otherwise, because nothing counted.
 */
export function bedsFree(capacity: number, occupied: number): number {
  return Math.max(0, capacity - occupied);
}

export function roomTone(capacity: number, occupied: number): Tone {
  if (occupied > capacity) return "danger";
  if (occupied === capacity) return "warning";
  return "success";
}
