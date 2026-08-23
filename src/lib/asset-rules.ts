/**
 * What a thing is worth, and what state it is in.
 *
 * Pure and client-safe, because the register page, the printed report, the
 * detail screen and the tests all have to agree about the same numbers. An
 * auditor comparing the figure on screen with the figure on the printout is
 * the person this module exists for; two implementations of straight-line
 * depreciation that round differently would give them two answers and no way
 * to tell which is the school's.
 */

export const ASSET_STATUSES = [
  { value: "IN_USE", label: "In use", tone: "success" },
  { value: "IN_STORE", label: "In store", tone: "info" },
  { value: "UNDER_REPAIR", label: "Under repair", tone: "warning" },
  { value: "MISSING", label: "Missing", tone: "danger" },
  { value: "DISPOSED", label: "Disposed", tone: "neutral" },
  { value: "WRITTEN_OFF", label: "Written off", tone: "neutral" },
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number]["value"];

export const ASSET_CONDITIONS = [
  { value: "NEW", label: "New", tone: "success" },
  { value: "GOOD", label: "Good", tone: "success" },
  { value: "FAIR", label: "Fair", tone: "info" },
  { value: "POOR", label: "Poor", tone: "warning" },
  { value: "UNSERVICEABLE", label: "Unserviceable", tone: "danger" },
] as const;

export type AssetCondition = (typeof ASSET_CONDITIONS)[number]["value"];

/**
 * Still the school's, and still expected to be usable.
 *
 * MISSING counts as held on purpose: a thing nobody can find has not stopped
 * being the school's property, and dropping it from the total is how a
 * register quietly loses a projector a year. It is reported separately so the
 * number is visible rather than absorbed.
 */
export function isHeld(status: AssetStatus): boolean {
  return status !== "DISPOSED";
}

/** In service — available for somebody to actually use today. */
export function isInService(status: AssetStatus): boolean {
  return status === "IN_USE" || status === "IN_STORE";
}

export function statusLabel(status: string): string {
  return ASSET_STATUSES.find((entry) => entry.value === status)?.label ?? status;
}

export function conditionLabel(condition: string): string {
  return ASSET_CONDITIONS.find((entry) => entry.value === condition)?.label ?? condition;
}

// -----------------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------------

/**
 * The sticker on the object: "STM/ICT/0042".
 *
 * Deliberately readable and deliberately not the database id. During a
 * stock-take somebody is standing in a store room reading a label out loud to
 * somebody else with a clipboard, and a cuid cannot survive that.
 */
export function assetTag(
  schoolPrefix: string,
  categoryCode: string | null | undefined,
  sequence: number,
): string {
  const clean = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);

  const prefix = clean(schoolPrefix) || "SCH";
  const category = clean(categoryCode ?? "") || "GEN";
  return `${prefix}/${category}/${String(sequence).padStart(4, "0")}`;
}

/** The number at the end of a tag, for working out the next one. */
export function tagSequence(tag: string): number | null {
  const match = /(\d+)\s*$/.exec(tag.trim());
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// -----------------------------------------------------------------------------
// Depreciation
// -----------------------------------------------------------------------------

export type Depreciable = {
  costMinor: number;
  residualMinor: number;
  /** Null, zero or negative all mean "this does not depreciate". */
  usefulLifeYears: number | null;
  purchasedOn: Date | null;
  /** Depreciation stops on the day it leaves. */
  disposedOn?: Date | null;
};

export type Depreciation = {
  /** Whole months in service at the valuation date. */
  months: number;
  /** Cost less residual — the part that can ever be written off. */
  depreciableMinor: number;
  /** A full year's charge, for the note under the register. */
  annualMinor: number;
  accumulatedMinor: number;
  /** Cost less accumulated. Never below the residual value. */
  netBookMinor: number;
  fullyDepreciated: boolean;
  /** No life set, so the asset is carried at cost. Land, mostly. */
  notDepreciated: boolean;
};

/**
 * Whole months from one date to another, counting a month only once the day
 * of the month has come round again.
 *
 * A bus bought on the 20th of January has not served a month of the school's
 * life on the 3rd of February, and charging it one would put a figure in the
 * accounts that the purchase invoice contradicts.
 */
export function monthsBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Straight line, monthly, never below the residual value.
 *
 * Straight line because it is what Ghanaian school auditors expect and what a
 * board can follow without a spreadsheet; monthly because assets are bought
 * during a term and a whole year's charge on a projector bought in June is
 * simply wrong.
 *
 * Everything is computed in minor units with one rounding at the end, so the
 * accumulated figure and the net book value always add back to cost exactly.
 * Rounding each month separately drifts, and the drift is what an auditor
 * finds.
 */
export function depreciate(asset: Depreciable, asOf: Date): Depreciation {
  const cost = Math.max(0, Math.round(asset.costMinor));
  // A residual above cost would make the depreciable amount negative and the
  // net book value exceed what was paid.
  const residual = Math.min(Math.max(0, Math.round(asset.residualMinor)), cost);
  const depreciableMinor = cost - residual;

  const life = asset.usefulLifeYears ?? 0;

  if (!asset.purchasedOn || life <= 0 || depreciableMinor === 0) {
    return {
      months: 0,
      depreciableMinor,
      annualMinor: 0,
      accumulatedMinor: 0,
      netBookMinor: cost,
      fullyDepreciated: false,
      notDepreciated: true,
    };
  }

  // Disposal stops the clock. Valuing a sold bus as though the school had gone
  // on owning it overstates next year's charge and understates the gain.
  const until =
    asset.disposedOn && asset.disposedOn < asOf ? asset.disposedOn : asOf;

  const totalMonths = life * 12;
  const months = Math.min(monthsBetween(asset.purchasedOn, until), totalMonths);

  const accumulatedMinor = Math.min(
    depreciableMinor,
    Math.round((depreciableMinor * months) / totalMonths),
  );

  return {
    months,
    depreciableMinor,
    annualMinor: Math.round(depreciableMinor / life),
    accumulatedMinor,
    netBookMinor: cost - accumulatedMinor,
    fullyDepreciated: accumulatedMinor >= depreciableMinor,
    notDepreciated: false,
  };
}

/**
 * What the school made or lost on letting something go.
 *
 * Proceeds against the written-down value, not against cost — selling a
 * six-year-old minibus for GH₵8,000 is a gain if the books say it was worth
 * GH₵5,000, however much it cost when new. This is the figure the statement of
 * accounts needs and the one people get backwards.
 */
export function disposalResult(
  asset: Depreciable & { disposalProceedsMinor: number },
): { netBookMinor: number; proceedsMinor: number; gainMinor: number } | null {
  if (!asset.disposedOn) return null;

  const atDisposal = depreciate(asset, asset.disposedOn);
  const proceedsMinor = Math.max(0, Math.round(asset.disposalProceedsMinor));

  return {
    netBookMinor: atDisposal.netBookMinor,
    proceedsMinor,
    gainMinor: proceedsMinor - atDisposal.netBookMinor,
  };
}

// -----------------------------------------------------------------------------
// Servicing and warranty
// -----------------------------------------------------------------------------

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  // Rolling 31 January forward one month must not land in March.
  if (result.getDate() < day) result.setDate(0);
  return result;
}

export type Serviceable = {
  serviceIntervalMonths: number | null;
  lastServicedOn: Date | null;
  purchasedOn: Date | null;
  status: AssetStatus;
};

export type ServiceState = {
  dueOn: Date | null;
  overdue: boolean;
  dueSoon: boolean;
  /** Never serviced and no purchase date to count from. */
  unknown: boolean;
};

/**
 * When the generator is next due, and whether it is late.
 *
 * Counted from the last service, or from the purchase where there has never
 * been one — an asset that has never been serviced is the one most likely to
 * be overdue, and treating "no service recorded" as "not due" is how a bus
 * goes three years without an inspection.
 */
export function serviceState(
  asset: Serviceable,
  asOf: Date,
  soonDays = 30,
): ServiceState {
  if (!asset.serviceIntervalMonths || asset.serviceIntervalMonths <= 0) {
    return { dueOn: null, overdue: false, dueSoon: false, unknown: false };
  }

  // Nothing is chased for a thing the school has let go of.
  if (asset.status === "DISPOSED" || asset.status === "WRITTEN_OFF") {
    return { dueOn: null, overdue: false, dueSoon: false, unknown: false };
  }

  const from = asset.lastServicedOn ?? asset.purchasedOn;
  if (!from) {
    return { dueOn: null, overdue: false, dueSoon: false, unknown: true };
  }

  const dueOn = addMonths(from, asset.serviceIntervalMonths);
  const soon = new Date(asOf.getTime() + soonDays * 86_400_000);

  return {
    dueOn,
    overdue: dueOn < asOf,
    dueSoon: dueOn >= asOf && dueOn <= soon,
    unknown: false,
  };
}

export function warrantyState(
  expiresOn: Date | null | undefined,
  asOf: Date,
): "none" | "active" | "expiring" | "expired" {
  if (!expiresOn) return "none";
  if (expiresOn < asOf) return "expired";
  const soon = new Date(asOf.getTime() + 60 * 86_400_000);
  return expiresOn <= soon ? "expiring" : "active";
}

/**
 * How long since anybody confirmed this thing exists.
 *
 * A register nobody checks is a list of things the school used to have. Any
 * asset unseen for more than a year is flagged for the next stock-take, and an
 * asset never seen at all is flagged from the day it is entered.
 */
export function verificationState(
  lastVerifiedOn: Date | null | undefined,
  asOf: Date,
  staleDays = 365,
): { neverVerified: boolean; stale: boolean; days: number | null } {
  if (!lastVerifiedOn) return { neverVerified: true, stale: true, days: null };
  const days = Math.floor((asOf.getTime() - lastVerifiedOn.getTime()) / 86_400_000);
  return { neverVerified: false, stale: days > staleDays, days };
}

// -----------------------------------------------------------------------------
// The register, totalled
// -----------------------------------------------------------------------------

export type RegisterLine = Depreciable & {
  status: AssetStatus;
  disposalProceedsMinor: number;
};

export type RegisterTotals = {
  count: number;
  heldCount: number;
  disposedCount: number;
  missingCount: number;
  costMinor: number;
  accumulatedMinor: number;
  netBookMinor: number;
  /** Realised on everything let go of in the period covered. */
  disposalGainMinor: number;
};

/**
 * The figures at the bottom of the register.
 *
 * Disposed assets are excluded from cost and net book value — the school does
 * not own them — but counted, because a register that simply stops mentioning
 * the minibus invites the question of what happened to it. Their gain or loss
 * is totalled separately, which is where it belongs in the accounts.
 */
export function registerTotals(lines: RegisterLine[], asOf: Date): RegisterTotals {
  const totals: RegisterTotals = {
    count: lines.length,
    heldCount: 0,
    disposedCount: 0,
    missingCount: 0,
    costMinor: 0,
    accumulatedMinor: 0,
    netBookMinor: 0,
    disposalGainMinor: 0,
  };

  for (const line of lines) {
    if (line.status === "DISPOSED") {
      totals.disposedCount += 1;
      const result = disposalResult(line);
      if (result) totals.disposalGainMinor += result.gainMinor;
      continue;
    }

    totals.heldCount += 1;
    if (line.status === "MISSING") totals.missingCount += 1;

    const value = depreciate(line, asOf);
    totals.costMinor += Math.max(0, Math.round(line.costMinor));
    totals.accumulatedMinor += value.accumulatedMinor;
    totals.netBookMinor += value.netBookMinor;
  }

  return totals;
}

/**
 * The residual amount a category's percentage implies for a given cost.
 *
 * Kept here rather than in the form so the number stored on the asset and the
 * number the form suggested cannot drift apart.
 */
export function residualFromPercent(costMinor: number, percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round((Math.max(0, costMinor) * clamped) / 100);
}
