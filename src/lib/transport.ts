/**
 * School transport, in one place.
 *
 * Direction, capacity, and what makes a bus unfit to run are asked by the
 * route page, the assignment form, the printed manifest, the student record
 * and the guardian portal. Five answers is four too many: the office would
 * seat a thirty-first child on a thirty-seat bus while the manifest said the
 * bus was full, and both screens would be right about themselves.
 */

export const DIRECTIONS = [
  { value: "BOTH", label: "Both ways" },
  { value: "MORNING", label: "Morning only" },
  { value: "AFTERNOON", label: "Afternoon only" },
] as const;

export type Direction = (typeof DIRECTIONS)[number]["value"];

export function directionLabel(value: string): string {
  return DIRECTIONS.find((entry) => entry.value === value)?.label ?? value;
}

/**
 * Whether an assignment puts a child on the bus for the given run.
 *
 * BOTH counts for each. This is the whole of the rule and it is written once,
 * because the morning manifest and the afternoon manifest are the same list
 * filtered two different ways, and a school that gets this wrong sends a bus
 * out short of a seat or leaves a child at the gate.
 */
export function travelsOn(direction: string, run: "MORNING" | "AFTERNOON"): boolean {
  return direction === "BOTH" || direction === run;
}

/**
 * Which existing live directions a new one would collide with.
 *
 * A child can hold MORNING and AFTERNOON separately — dropped off by a parent,
 * home on the bus — but BOTH cannot sit beside either, and neither can repeat.
 * The unique index in the migration stops a duplicate of the same direction;
 * this is the part it cannot see, and the reason the check lives here rather
 * than in the action that happens to need it first.
 */
export function conflictingDirections(next: string): string[] {
  if (next === "BOTH") return ["BOTH", "MORNING", "AFTERNOON"];
  return ["BOTH", next];
}

/** How many seats a run needs, counting each child once. */
export function seatsNeeded(
  assignments: Array<{ direction: string }>,
  run: "MORNING" | "AFTERNOON",
): number {
  return assignments.filter((entry) => travelsOn(entry.direction, run)).length;
}

export type Fitness = {
  /** True when the bus should not be running today. */
  grounded: boolean;
  /** Short reasons, in the order someone would want to hear them. */
  reasons: string[];
};

/**
 * Whether a bus is fit to be on the road.
 *
 * Roadworthy and insurance are the two certificates a police checkpoint on
 * the Spintex Road asks for, and both expire on a date the school knows
 * months in advance and forgets anyway. Within thirty days is a warning
 * rather than a refusal — the bus still runs, but somebody has to book it in.
 */
export function fitnessOf(
  vehicle: { roadworthyExpiry?: Date | null; insuranceExpiry?: Date | null; isActive?: boolean },
  asOf = new Date(),
): Fitness {
  const reasons: string[] = [];
  let grounded = false;

  if (vehicle.isActive === false) {
    grounded = true;
    reasons.push("Marked out of service");
  }

  const soon = new Date(asOf.getTime() + 30 * 86_400_000);

  for (const [label, expiry] of [
    ["Roadworthy", vehicle.roadworthyExpiry],
    ["Insurance", vehicle.insuranceExpiry],
  ] as const) {
    if (!expiry) continue;
    if (expiry < asOf) {
      grounded = true;
      reasons.push(`${label} expired`);
    } else if (expiry < soon) {
      reasons.push(`${label} expires within a month`);
    }
  }

  return { grounded, reasons };
}

/**
 * A route's seating, given its buses and the children on it.
 *
 * Morning and afternoon are counted separately because they genuinely differ,
 * and reporting the larger of the two as "the" number would hide a route that
 * is fine at seven in the morning and over capacity at three.
 */
export function capacityOf(
  vehicles: Array<{ capacity: number; isActive?: boolean }>,
  assignments: Array<{ direction: string }>,
) {
  const seats = vehicles
    .filter((vehicle) => vehicle.isActive !== false)
    .reduce((sum, vehicle) => sum + vehicle.capacity, 0);

  const morning = seatsNeeded(assignments, "MORNING");
  const afternoon = seatsNeeded(assignments, "AFTERNOON");

  return {
    seats,
    morning,
    afternoon,
    /** The run that is worst off, which is the one to report. */
    peak: Math.max(morning, afternoon),
    over: Math.max(morning, afternoon) > seats,
  };
}
