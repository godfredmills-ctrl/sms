/**
 * All monetary amounts in the system are integers in MINOR units (pesewas for
 * GHS). Floating-point cedis do not survive repeated part-payment arithmetic,
 * so nothing outside this module should handle money as a float.
 */

export const DEFAULT_CURRENCY = "GHS";

const CURRENCY_SYMBOLS: Record<string, string> = {
  GHS: "GH₵",
  USD: "$",
  GBP: "£",
  EUR: "€",
  NGN: "₦",
};

/** "1234.56" | 1234.56 -> 123456 */
export function toMinor(amount: number | string): number {
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** 123456 -> 1234.56 */
export function toMajor(minor: number): number {
  return Math.round(minor) / 100;
}

export function formatMoney(
  minor: number,
  currency: string = DEFAULT_CURRENCY,
  options: { withSymbol?: boolean; compact?: boolean } = {},
): string {
  const { withSymbol = true, compact = false } = options;
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const value = toMajor(minor ?? 0);

  if (compact && Math.abs(value) >= 1000) {
    const formatted = new Intl.NumberFormat("en-GH", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
    return withSymbol ? `${symbol}${formatted}` : formatted;
  }

  const formatted = new Intl.NumberFormat("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  return withSymbol ? `${symbol}${formatted}` : formatted;
}

/** Percentage discounts round down so the school never under-bills by a pesewa. */
export function applyPercentage(minor: number, percent: number): number {
  return Math.floor((minor * percent) / 100);
}

export function sumMinor(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/**
 * Splits an amount into `parts` instalments without losing pesewas: the
 * remainder is spread one pesewa at a time across the earliest instalments.
 */
export function splitEvenly(totalMinor: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(totalMinor / parts);
  const remainder = totalMinor - base * parts;
  return Array.from({ length: parts }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

export function percentOf(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
