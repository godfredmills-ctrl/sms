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

// ---------------------------------------------------------------------------
// Whose house
//
// A boarding school here has five or six houses and a house parent who sleeps
// in one of them. Until now every boarding screen showed all of them, and the
// question of whether that was right was left open for months.
//
// It is not right, for two reasons that are worth separating. The small one is
// that a list of three hundred boarders across six houses, shown to somebody
// responsible for fifty, is a list nobody reads; "who is out" stops being a
// thing you scan before lights out. The large one is that the boarding screens
// reach a child's medical notes and their discipline record, and a house
// parent has no more claim to those for another house than any other teacher
// does.
//
// So the scope is a real thing, and it is a value passed about rather than a
// query each screen writes for itself. The alternative — every page filtering
// by house in its own words — is how a list ends up refusing what an action
// permits, which is the failure this codebase keeps finding.
// ---------------------------------------------------------------------------

export type HouseScope =
  /// Whoever runs boarding across the school: the boarding master, the head.
  | { all: true }
  /// A house parent, and the houses they answer for. Usually one.
  | { all: false; houseIds: string[] };

export const EVERY_HOUSE: HouseScope = { all: true };

export function scopeOfHouses(houseIds: string[]): HouseScope {
  return { all: false, houseIds };
}

/** Whether this scope covers a house. */
export function withinScope(
  scope: HouseScope,
  houseId: string | null | undefined,
): boolean {
  if (scope.all) return true;
  if (!houseId) return false;
  return scope.houseIds.includes(houseId);
}

/**
 * A Prisma filter for the houses in scope, spread into a wider where clause.
 *
 * An empty object for somebody who sees everything, so the caller does not
 * have to branch. A house parent with no house yet gets a filter that matches
 * nothing, which is the honest answer: it is not "everything" and it is not an
 * error either, it is somebody whose house has not been recorded.
 */
export function houseFilter(scope: HouseScope) {
  if (scope.all) return {};
  return { houseId: { in: scope.houseIds } };
}

/**
 * Why this person may not act on this house, or null if they may.
 *
 * The screens filter and this refuses, and both read the same scope, so a
 * house parent cannot reach another house by keeping a link from a colleague
 * or by editing the address bar.
 */
export function outsideScope(
  scope: HouseScope,
  houseId: string | null | undefined,
  what = "that boarder",
): string | null {
  if (withinScope(scope, houseId)) return null;

  if (!scope.all && scope.houseIds.length === 0) {
    return "You are not recorded as the parent of any house, so there is nobody here you can act for. Whoever manages boarding sets that on the house.";
  }

  return `${what.charAt(0).toUpperCase()}${what.slice(1)} is not in your house. Whoever runs boarding, or the parent of that house, deals with this one.`;
}
