/**
 * The school store: what is on the shelf and what it is worth.
 *
 * Pure and client-safe, for the same reason `asset-rules` is: the store page,
 * the issue voucher, the printed stock report and the tests must agree about
 * every figure. A store whose screen and whose printout disagree about how
 * much rice is left is worse than no store at all.
 *
 * Two conventions, both deliberate and both matching the rest of this system:
 *
 * **Money is integer minor units** (pesewas), as everywhere else.
 *
 * **Quantities are integer thousandths** — "milli-units". A store deals in
 * 2.5 kg of rice and 1.5 litres of disinfectant, and floating point cannot add
 * a hundred of those without drifting; 0.1 + 0.2 is famously not 0.3, and a
 * stock balance that is wrong in the fourth decimal place turns into a
 * stock-take variance nobody can explain. Three decimal places is enough for
 * anything a school store issues and is exact in integers.
 */

export const MILLI = 1000;

export function toMilli(quantity: number): number {
  return Math.round(quantity * MILLI);
}

export function fromMilli(milli: number): number {
  return milli / MILLI;
}

/** For display: "2.5", "12", "0.75" — never "2.500". */
export function formatQuantity(milli: number): string {
  const value = fromMilli(milli);
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/**
 * The unit, agreeing with the number in front of it.
 *
 * "6 sack" and "12.5 litre" are what a store voucher says when nobody has
 * thought about it, and it is the first thing anyone notices on a document
 * they are being asked to sign. Units are free text because suppliers invent
 * them, so this handles the ordinary English cases and leaves anything already
 * plural alone.
 */
export function pluraliseUnit(unit: string, milli: number): string {
  const trimmed = unit.trim();
  if (!trimmed) return "";
  if (milli === MILLI) return trimmed;

  const lower = trimmed.toLowerCase();
  // "each" is invariant, and anything already plural stays as it is.
  if (lower === "each" || lower.endsWith("s")) return trimmed;
  if (/(x|z|ch|sh)$/.test(lower)) return `${trimmed}es`;
  return `${trimmed}s`;
}

/** A quantity and its unit, agreeing: "6 sacks", "1 sack", "2.5 litres". */
export function formatUnits(milli: number, unit: string): string {
  return `${formatQuantity(milli)} ${pluraliseUnit(unit, milli)}`.trim();
}

// -----------------------------------------------------------------------------
// Movements
// -----------------------------------------------------------------------------

export const MOVEMENT_KINDS = [
  {
    value: "OPENING",
    label: "Opening balance",
    /** Adds to the shelf. */
    inward: true,
    blurb: "What was already there when the store was first counted.",
  },
  {
    value: "RECEIPT",
    label: "Received",
    inward: true,
    blurb: "Delivered by a supplier, against a bill.",
  },
  {
    value: "RETURN",
    label: "Returned",
    inward: true,
    blurb: "Given back unused — comes in at what it went out at.",
  },
  {
    value: "ISSUE",
    label: "Issued",
    inward: false,
    blurb: "Given out to a department or a person, against a voucher.",
  },
  {
    value: "WASTE",
    label: "Written off",
    inward: false,
    blurb: "Spoiled, expired, broken or stolen.",
  },
  {
    value: "ADJUSTMENT_UP",
    label: "Adjustment (found)",
    inward: true,
    blurb: "A count found more than the book said.",
  },
  {
    value: "ADJUSTMENT_DOWN",
    label: "Adjustment (short)",
    inward: false,
    blurb: "A count found less than the book said.",
  },
] as const;

export type MovementKind = (typeof MOVEMENT_KINDS)[number]["value"];

export function isInward(kind: MovementKind): boolean {
  return MOVEMENT_KINDS.find((entry) => entry.value === kind)?.inward ?? false;
}

export function movementLabel(kind: string): string {
  return MOVEMENT_KINDS.find((entry) => entry.value === kind)?.label ?? kind;
}

export type Movement = {
  kind: MovementKind;
  /** Always positive. The kind decides the direction. */
  quantityMilli: number;
  /**
   * What one whole unit cost, in minor units. Only meaningful on a receipt;
   * anything going out is valued at the running average, and anything coming
   * back comes back at it.
   */
  unitCostMinor?: number | null;
};

export type StockState = {
  quantityMilli: number;
  /** What the quantity on hand is worth, in minor units. */
  valueMinor: number;
  /**
   * Cost of one whole unit, derived rather than stored.
   *
   * Holding a rounded average and multiplying it back out is how a store's
   * value drifts away from the sum of what it paid: round once, at the end,
   * for display. Null when there is nothing on the shelf, because the average
   * cost of nothing is not zero — it is undefined, and printing GH₵0.00
   * invites somebody to issue against it.
   */
  averageCostMinor: number | null;
  /** Movements that would have taken the shelf below zero. */
  oversold: number;
};

/**
 * Replays the movements and says what is on the shelf.
 *
 * Weighted average cost — the moving-average method — because it is what a
 * school store can actually operate. FIFO needs every issue matched to the
 * delivery it came from, which means a storekeeper tracking batches of exercise
 * books by hand; the average needs only the running total, and for goods a
 * school buys repeatedly at similar prices the two barely differ.
 *
 * Movements must be supplied oldest first. Order changes the answer: goods
 * issued before a delivery arrived are valued at the old average, which is the
 * point of the method.
 */
export function runningStock(movements: Movement[]): StockState {
  let quantityMilli = 0;
  let valueMinor = 0;
  let oversold = 0;

  for (const movement of movements) {
    const signed = signedQuantityMilli(movement);

    if (signed > 0) {
      // Coming in. A receipt carries its own cost; anything else comes in at
      // what the shelf is already worth, because it was never bought again.
      const unitCost =
        movement.kind === "RECEIPT" || movement.kind === "OPENING"
          ? (movement.unitCostMinor ?? averageOf(quantityMilli, valueMinor) ?? 0)
          : (averageOf(quantityMilli, valueMinor) ?? movement.unitCostMinor ?? 0);

      quantityMilli += signed;
      valueMinor += Math.round((signed * unitCost) / MILLI);
      continue;
    }

    if (signed < 0) {
      const leaving = Math.min(-signed, quantityMilli);
      if (-signed > quantityMilli) oversold += 1;

      const average = averageOf(quantityMilli, valueMinor);

      quantityMilli -= leaving;
      // The last thing out takes the remaining value with it, whatever the
      // rounding has done along the way. Otherwise an empty shelf is left
      // holding a few pesewas that no quantity explains, and the store's total
      // value never comes back to zero.
      valueMinor =
        quantityMilli === 0 ? 0 : valueMinor - Math.round((leaving * (average ?? 0)) / MILLI);
    }
  }

  return {
    quantityMilli,
    valueMinor: quantityMilli === 0 ? 0 : valueMinor,
    averageCostMinor: averageOf(quantityMilli, valueMinor),
    oversold,
  };
}

/**
 * Which way a movement moves the shelf, and by how much.
 *
 * The kind decides the direction, always — which is why a correction is two
 * kinds rather than one carrying a sign. A single ADJUSTMENT with a separate
 * signed field gives direction two sources that can disagree, and a stored row
 * saying "issue, +5" would then be read one way by the balance and the other
 * way by the screen. Here a row cannot say that.
 *
 * Quantities are stored positive; the sign is never in the data.
 */
export function signedQuantityMilli(movement: Movement): number {
  const magnitude = Math.abs(movement.quantityMilli);
  return isInward(movement.kind) ? magnitude : -magnitude;
}

function averageOf(quantityMilli: number, valueMinor: number): number | null {
  if (quantityMilli <= 0) return null;
  return Math.round((valueMinor * MILLI) / quantityMilli);
}

/** What issuing this much would cost, at the current average. */
export function issueValueMinor(state: StockState, quantityMilli: number): number {
  if (!state.averageCostMinor) return 0;
  return Math.round((Math.abs(quantityMilli) * state.averageCostMinor) / MILLI);
}

// -----------------------------------------------------------------------------
// Reordering
// -----------------------------------------------------------------------------

export type StockLevel = "OUT" | "LOW" | "OK" | "UNTRACKED";

/**
 * Whether the storekeeper needs to do something.
 *
 * "Low" is deliberately not "below the reorder level" alone — an item with no
 * reorder level set is not fine, it is untracked, and saying so is the only
 * way anybody ever sets one.
 */
export function stockLevel(
  quantityMilli: number,
  reorderLevelMilli: number | null | undefined,
): StockLevel {
  if (quantityMilli <= 0) return "OUT";
  if (reorderLevelMilli === null || reorderLevelMilli === undefined || reorderLevelMilli <= 0) {
    return "UNTRACKED";
  }
  return quantityMilli <= reorderLevelMilli ? "LOW" : "OK";
}

/**
 * How much to buy: back up to the reorder quantity, or to the reorder level
 * where no target is set. Rounded up to a whole unit, because a supplier does
 * not deliver two thirds of a sack.
 */
export function suggestedOrderMilli(
  quantityMilli: number,
  reorderLevelMilli: number | null | undefined,
  reorderQuantityMilli: number | null | undefined,
): number {
  const target = reorderQuantityMilli || reorderLevelMilli || 0;
  if (target <= 0) return 0;
  const shortfall = target - quantityMilli;
  if (shortfall <= 0) return 0;
  return Math.ceil(shortfall / MILLI) * MILLI;
}

// -----------------------------------------------------------------------------
// Expiry
// -----------------------------------------------------------------------------

export function expiryState(
  expiresOn: Date | null | undefined,
  asOf: Date,
  soonDays = 30,
): "none" | "fresh" | "soon" | "expired" {
  if (!expiresOn) return "none";
  if (expiresOn < asOf) return "expired";
  return expiresOn.getTime() - asOf.getTime() <= soonDays * 86_400_000 ? "soon" : "fresh";
}

// -----------------------------------------------------------------------------
// Stock-take
// -----------------------------------------------------------------------------

export type Variance = {
  expectedMilli: number;
  countedMilli: number;
  differenceMilli: number;
  /** Positive means more was found than the book said. */
  overage: boolean;
  valueMinor: number;
  /** Nothing to explain. */
  agrees: boolean;
};

/**
 * What a physical count found against what the book says.
 *
 * The difference is valued at the average cost, because that is what the
 * missing goods were carried at — and a variance nobody has put a figure on is
 * a variance nobody investigates.
 */
export function stocktakeVariance(
  state: StockState,
  countedMilli: number,
): Variance {
  const differenceMilli = countedMilli - state.quantityMilli;
  return {
    expectedMilli: state.quantityMilli,
    countedMilli,
    differenceMilli,
    overage: differenceMilli > 0,
    valueMinor: Math.round(
      (Math.abs(differenceMilli) * (state.averageCostMinor ?? 0)) / MILLI,
    ),
    agrees: differenceMilli === 0,
  };
}

// -----------------------------------------------------------------------------
// The store, totalled
// -----------------------------------------------------------------------------

export type StoreLine = {
  quantityMilli: number;
  valueMinor: number;
  reorderLevelMilli: number | null;
  expiresOn?: Date | null;
};

export function storeTotals(lines: StoreLine[], asOf: Date) {
  const totals = {
    items: lines.length,
    valueMinor: 0,
    outOfStock: 0,
    low: 0,
    untracked: 0,
    expired: 0,
    expiringSoon: 0,
  };

  for (const line of lines) {
    totals.valueMinor += line.valueMinor;

    switch (stockLevel(line.quantityMilli, line.reorderLevelMilli)) {
      case "OUT":
        totals.outOfStock += 1;
        break;
      case "LOW":
        totals.low += 1;
        break;
      case "UNTRACKED":
        totals.untracked += 1;
        break;
    }

    // Only what is actually on the shelf can go off. An expired line with
    // nothing left is a line that was used up in time.
    if (line.quantityMilli > 0) {
      const expiry = expiryState(line.expiresOn, asOf);
      if (expiry === "expired") totals.expired += 1;
      else if (expiry === "soon") totals.expiringSoon += 1;
    }
  }

  return totals;
}
