/** Small, dependency-free helpers shared across server and client components. */

/** Conditional className joiner. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

// -----------------------------------------------------------------------------
// Names & identifiers
// -----------------------------------------------------------------------------

export function fullName(person: {
  firstName?: string | null;
  lastName?: string | null;
  otherNames?: string | null;
  title?: string | null;
}): string {
  return [person.title, person.firstName, person.otherNames, person.lastName]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Mensah, Kwame A." — the order registers and mark sheets are sorted in. */
export function listName(person: {
  firstName?: string | null;
  lastName?: string | null;
  otherNames?: string | null;
}): string {
  const initials = person.otherNames
    ? person.otherNames
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => `${part[0].toUpperCase()}.`)
        .join(" ")
    : "";
  return [person.lastName, [person.firstName, initials].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Turns an enum member like ON_LEAVE into "On Leave" for display. */
export function humanise(value: string | null | undefined): string {
  if (!value) return "-";
  return titleCase(value);
}

// -----------------------------------------------------------------------------
// Ghana-specific formatting
// -----------------------------------------------------------------------------

/**
 * Normalises Ghanaian numbers to E.164 (+233...). Accepts 0244123456,
 * 244123456, +233244123456 and 233244123456.
 */
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("233")) return `+${digits}`;
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  if (digits.length === 9) return `+233${digits}`;
  return digits;
}

export function formatPhone(input: string | null | undefined): string {
  const normalised = normalisePhone(input);
  if (!normalised) return "-";
  const match = normalised.match(/^\+233(\d{2})(\d{3})(\d{4})$/);
  return match ? `+233 ${match[1]} ${match[2]} ${match[3]}` : normalised;
}

/** MTN / Telecel / AirtelTigo prefix detection, used to preselect the network. */
export function detectMomoNetwork(phone: string | null | undefined): string | null {
  const normalised = normalisePhone(phone);
  if (!normalised?.startsWith("+233")) return null;
  const prefix = normalised.slice(4, 6);

  if (["24", "25", "53", "54", "55", "59"].includes(prefix)) return "MTN";
  if (["20", "50"].includes(prefix)) return "TELECEL";
  if (["26", "27", "56", "57"].includes(prefix)) return "AIRTELTIGO";
  return null;
}

// -----------------------------------------------------------------------------
// Dates
// -----------------------------------------------------------------------------

export function formatDate(
  value: Date | string | null | undefined,
  style: "short" | "long" | "full" = "short",
): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";

  const options: Intl.DateTimeFormatOptions =
    style === "full"
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : style === "long"
        ? { day: "numeric", month: "long", year: "numeric" }
        : { day: "2-digit", month: "short", year: "numeric" };

  return new Intl.DateTimeFormat("en-GB", options).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34524, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let duration = seconds;
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) return formatter.format(Math.round(duration), unit);
    duration /= amount;
  }
  return formatter.format(Math.round(duration), "year");
}

export function calculateAge(dateOfBirth: Date | string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

/** Midnight UTC — attendance is stored as a calendar date, not an instant. */
export function toDateOnly(value: Date | string): Date {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** School days between two dates, excluding weekends and supplied holidays. */
export function countSchoolDays(start: Date, end: Date, holidays: Date[] = []): number {
  const holidayKeys = new Set(holidays.map((d) => toDateOnly(d).toISOString()));
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (!isWeekend(cursor) && !holidayKeys.has(toDateOnly(cursor).toISOString())) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// -----------------------------------------------------------------------------
// Numbers & collections
// -----------------------------------------------------------------------------

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-GH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(decimals)}%`;
}

/** Prisma Decimal, number or string -> number. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && "toNumber" in (value as object)) {
    try {
      return (value as { toNumber(): number }).toNumber();
    } catch {
      return null;
    }
  }
  return null;
}

export function groupBy<T, K extends string | number>(
  items: T[],
  keyOf: (item: T) => K,
): Record<K, T[]> {
  return items.reduce(
    (acc, item) => {
      const key = keyOf(item);
      (acc[key] ??= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/**
 * Competition ranking (1, 2, 2, 4) for class positions — students on the same
 * mark must share a position.
 */
export function rankDescending<T>(items: T[], scoreOf: (item: T) => number | null): Map<T, number> {
  const sorted = [...items].sort((a, b) => (scoreOf(b) ?? -1) - (scoreOf(a) ?? -1));
  const positions = new Map<T, number>();
  let lastScore: number | null = null;
  let lastPosition = 0;

  sorted.forEach((item, index) => {
    const score = scoreOf(item);
    if (score === null) return;
    if (score === lastScore) {
      positions.set(item, lastPosition);
    } else {
      lastPosition = index + 1;
      lastScore = score;
      positions.set(item, lastPosition);
    }
  });

  return positions;
}
