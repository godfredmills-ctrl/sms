/**
 * Cafeteria arithmetic and the allergy check, with no database in sight.
 *
 * Pure so the serving screen can run it in the browser as somebody types a
 * name, and so the whole of it can be tested without a database. The server
 * runs the same functions before it writes, because a check that only happens
 * in the browser is a check that happens only when the browser feels like it.
 *
 * The interesting part is `allergyWarnings`. Every school already holds its
 * pupils' allergies; almost none of them get that fact to the person holding
 * the ladle. Written down in a file, an allergy is a liability. Shown on the
 * screen at the moment a child reaches the counter, it is a control.
 */

// ---------------------------------------------------------------------------
// Sittings
// ---------------------------------------------------------------------------

export const SITTINGS = [
  { value: "BREAKFAST", label: "Breakfast", order: 1 },
  { value: "BREAK", label: "Break", order: 2 },
  { value: "LUNCH", label: "Lunch", order: 3 },
  { value: "SUPPER", label: "Supper", order: 4 },
] as const;

export type Sitting = (typeof SITTINGS)[number]["value"];

export const SITTING_VALUES: Sitting[] = SITTINGS.map((entry) => entry.value);

export function sittingLabel(value: string): string {
  return SITTINGS.find((entry) => entry.value === value)?.label ?? value;
}

/** Breakfast before lunch before supper, whatever order they arrive in. */
export function sortSittings(values: string[]): string[] {
  const order = new Map(SITTINGS.map((entry) => [entry.value as string, entry.order]));
  return [...values].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

export const DAYS = [
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
  { value: 7, label: "Sunday", short: "Sun" },
] as const;

/**
 * ISO day number: Monday is 1 and Sunday is 7.
 *
 * JavaScript's getDay() puts Sunday at 0, which sorts the week wrongly and
 * makes "the weekend" two non-adjacent numbers. Boarding schools cook on
 * Saturday and Sunday, so this is not a detail that can be left alone.
 */
export function isoDay(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function dayLabel(value: number): string {
  return DAYS.find((entry) => entry.value === value)?.label ?? "";
}

// ---------------------------------------------------------------------------
// The rota
// ---------------------------------------------------------------------------

/**
 * Which week of the cycle a date falls in, counting from the menu's start.
 *
 * Counted in whole days from midnight to midnight rather than in milliseconds,
 * so an hour of daylight saving cannot move a Wednesday into the wrong week.
 * Ghana does not observe it; a school running this abroad might.
 *
 * Dates before the menu starts count backwards, which keeps the arithmetic
 * honest: a menu starting next Monday has a defined answer for today rather
 * than a negative week number or a crash.
 */
export function cycleWeekFor(date: Date, startsOn: Date, cycleWeeks: number): number {
  if (cycleWeeks < 1) return 1;

  const from = Date.UTC(startsOn.getFullYear(), startsOn.getMonth(), startsOn.getDate());
  const to = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

  // Back to the Monday of the starting week, so a menu entered as starting on
  // a Wednesday still runs Monday to Sunday like the rest of the school.
  const startMonday = from - (isoDay(startsOn) - 1) * 86_400_000;
  const dayMonday = to - (isoDay(date) - 1) * 86_400_000;

  const weeksApart = Math.round((dayMonday - startMonday) / (7 * 86_400_000));

  // Modulo that stays positive for dates before the start.
  return (((weeksApart % cycleWeeks) + cycleWeeks) % cycleWeeks) + 1;
}

export type MenuItemLike = {
  weekNumber: number;
  dayOfWeek: number;
  sitting: string;
};

/** The rota entry for a date and sitting, or nothing if the rota is silent. */
export function menuItemFor<T extends MenuItemLike>(
  items: T[],
  date: Date,
  menu: { startsOn: Date; cycleWeeks: number },
  sitting: string,
): T | null {
  const week = cycleWeekFor(date, menu.startsOn, menu.cycleWeeks);
  const day = isoDay(date);
  return (
    items.find(
      (item) =>
        item.weekNumber === week && item.dayOfWeek === day && item.sitting === sitting,
    ) ?? null
  );
}

/**
 * The gaps in a rota: days and sittings the kitchen is expected to cover and
 * the menu says nothing about.
 *
 * A menu with holes is not an error, because plenty of schools do not serve
 * breakfast on a Saturday. It is worth showing, because the common cause of a
 * hole is somebody filling in week 1 and forgetting week 2.
 */
export function menuGaps(
  items: MenuItemLike[],
  cycleWeeks: number,
  sittings: string[],
  days: number[] = [1, 2, 3, 4, 5],
): Array<{ weekNumber: number; dayOfWeek: number; sitting: string }> {
  const filled = new Set(
    items.map((item) => `${item.weekNumber}:${item.dayOfWeek}:${item.sitting}`),
  );
  const gaps: Array<{ weekNumber: number; dayOfWeek: number; sitting: string }> = [];

  for (let week = 1; week <= cycleWeeks; week += 1) {
    for (const day of days) {
      for (const sitting of sortSittings(sittings)) {
        if (!filled.has(`${week}:${day}:${sitting}`)) {
          gaps.push({ weekNumber: week, dayOfWeek: day, sitting });
        }
      }
    }
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Allergens
// ---------------------------------------------------------------------------

/**
 * The controlled list, with the words people actually write.
 *
 * A dish records allergens from this list and a pupil's medical record holds
 * free text, because a nurse taking a history writes what the parent said. So
 * the synonyms are the join: "groundnut" and "peanut" are the same allergy and
 * a different string, and a system that compares the strings finds nothing.
 * Nkate is groundnut in Twi and is what a Ghanaian parent is likely to write.
 *
 * Pork and beef are here despite being nobody's allergy. The serving screen
 * needs one list of "do not give this child that", and a Muslim child handed a
 * pork sausage is the same failure as a nut: something the school knew and did
 * not act on.
 */
export const ALLERGENS = [
  {
    key: "PEANUT",
    label: "Peanut",
    synonyms: ["peanut", "peanuts", "groundnut", "groundnuts", "nkate", "nkatie", "nkatee"],
  },
  {
    key: "TREE_NUT",
    label: "Tree nuts",
    synonyms: ["tree nut", "tree nuts", "nut", "nuts", "cashew", "almond", "walnut", "hazelnut", "pecan"],
  },
  {
    key: "MILK",
    label: "Milk",
    synonyms: ["milk", "dairy", "lactose", "cheese", "butter", "yoghurt", "yogurt"],
  },
  { key: "EGG", label: "Egg", synonyms: ["egg", "eggs"] },
  {
    key: "FISH",
    label: "Fish",
    synonyms: ["fish", "tilapia", "salmon", "tuna", "mackerel", "koobi", "momoni", "kako"],
  },
  {
    key: "SHELLFISH",
    label: "Shellfish",
    synonyms: ["shellfish", "prawn", "prawns", "shrimp", "crab", "lobster", "crayfish"],
  },
  { key: "SOYA", label: "Soya", synonyms: ["soy", "soya", "soybean", "soya bean", "soybeans"] },
  {
    key: "GLUTEN",
    label: "Gluten",
    synonyms: ["gluten", "wheat", "bread", "flour", "pasta", "barley", "rye"],
  },
  { key: "SESAME", label: "Sesame", synonyms: ["sesame", "benne", "sesame seed", "tahini"] },
  { key: "PORK", label: "Pork", synonyms: ["pork", "bacon", "ham", "pig", "sausage"] },
  { key: "BEEF", label: "Beef", synonyms: ["beef", "cow meat", "cattle"] },
] as const;

export type AllergenKey = (typeof ALLERGENS)[number]["key"];

export const ALLERGEN_KEYS: string[] = ALLERGENS.map((entry) => entry.key);

export function allergenLabel(key: string): string {
  return ALLERGENS.find((entry) => entry.key === key)?.label ?? key;
}

/**
 * A free-text allergy turned into a key from the list, or nothing.
 *
 * Word-boundary matching rather than a substring test. "Nuts" inside
 * "coconuts" is not a tree nut, and "ham" inside "hamper" is not pork, and
 * both of those would show a warning on every plate until people stopped
 * reading the warnings. That is the failure mode that matters: an alert people
 * have learnt to click through protects nobody.
 */
export function matchAllergen(text: string): string | null {
  const cleaned = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;

  for (const allergen of ALLERGENS) {
    for (const synonym of allergen.synonyms) {
      const pattern = new RegExp(`(^|\\s)${synonym}(s)?($|\\s)`);
      if (pattern.test(cleaned)) return allergen.key;
    }
  }

  return null;
}

/** Everything in a free-text line, not just the first thing. */
export function matchAllergens(text: string): string[] {
  const cleaned = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  const found: string[] = [];
  for (const allergen of ALLERGENS) {
    for (const synonym of allergen.synonyms) {
      const pattern = new RegExp(`(^|\\s)${synonym}(s)?($|\\s)`);
      if (pattern.test(cleaned)) {
        found.push(allergen.key);
        break;
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// The warning
// ---------------------------------------------------------------------------

export const SEVERITIES = ["MILD", "MODERATE", "SEVERE", "ANAPHYLAXIS"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** How serious, as a number, so warnings sort worst-first. */
export function severityRank(value: string | null | undefined): number {
  const at = SEVERITIES.indexOf(String(value ?? "").toUpperCase() as Severity);
  return at === -1 ? 0 : at;
}

export type RecordedAllergy = {
  name?: string | null;
  severity?: string | null;
  reaction?: string | null;
  treatment?: string | null;
};

export type Warning = {
  /** From the controlled list, so the screen can name it the same way twice. */
  allergen: string;
  label: string;
  /** What the medical record actually said, which is what a nurse recognises. */
  recordedAs: string;
  severity: Severity;
  reaction: string | null;
  treatment: string | null;
  /**
   * `stop` needs a typed reason before the meal can be recorded. `check` is
   * shown and can be dismissed. The line is drawn at severe rather than at
   * anaphylaxis: a severe reaction that is not technically anaphylactic still
   * ends with a child in a taxi to Korle Bu.
   */
  level: "stop" | "check";
};

/**
 * What this dish would do to this child.
 *
 * Takes the pupil's recorded allergies, their free-text dietary restrictions,
 * and the allergens on the plate, and returns the overlap. Empty means no
 * known conflict, which is not the same as safe and is not presented as such
 * anywhere in the interface.
 */
export function allergyWarnings(
  allergies: RecordedAllergy[] | null | undefined,
  dietaryRestrictions: string | null | undefined,
  present: string[],
): Warning[] {
  const onThePlate = new Set(present.map((value) => String(value).toUpperCase()));
  if (onThePlate.size === 0) return [];

  const warnings: Warning[] = [];
  const seen = new Set<string>();

  for (const entry of allergies ?? []) {
    const name = String(entry?.name ?? "").trim();
    if (!name) continue;

    const key = matchAllergen(name);
    if (!key || !onThePlate.has(key) || seen.has(key)) continue;

    seen.add(key);
    const severity = (String(entry?.severity ?? "MODERATE").toUpperCase() ||
      "MODERATE") as Severity;
    const known = SEVERITIES.includes(severity) ? severity : "MODERATE";

    warnings.push({
      allergen: key,
      label: allergenLabel(key),
      recordedAs: name,
      severity: known,
      reaction: entry?.reaction?.trim() || null,
      treatment: entry?.treatment?.trim() || null,
      level: severityRank(known) >= severityRank("SEVERE") ? "stop" : "check",
    });
  }

  // Dietary restrictions are free text and carry no severity, so they are
  // always a check rather than a stop. "No pork" is a rule about respect, and
  // handing somebody a plate over their objection is a different kind of
  // failure from a hospital visit.
  for (const key of matchAllergens(dietaryRestrictions ?? "")) {
    if (!onThePlate.has(key) || seen.has(key)) continue;
    seen.add(key);
    warnings.push({
      allergen: key,
      label: allergenLabel(key),
      recordedAs: (dietaryRestrictions ?? "").trim(),
      severity: "MILD",
      reaction: null,
      treatment: null,
      level: "check",
    });
  }

  return warnings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

/** Whether anything found needs a typed reason before the meal is recorded. */
export function needsOverride(warnings: Warning[]): boolean {
  return warnings.some((warning) => warning.level === "stop");
}

// ---------------------------------------------------------------------------
// Entitlement and price
// ---------------------------------------------------------------------------

export type PlanLike = {
  sittings: string[];
  priceMinor: number;
  perMealMinor: number;
};

export type SubscriptionLike = {
  status: string;
  startsOn: Date;
  endsOn: Date | null;
  plan: PlanLike;
};

/** Whether the plan pays for this sitting at all. */
export function planCovers(plan: PlanLike, sitting: string): boolean {
  return plan.sittings.includes(sitting);
}

/**
 * Whether a subscription is live on a date.
 *
 * Compared as whole days. A subscription that starts today should feed the
 * child at breakfast, and a millisecond comparison against a start time of
 * midnight would refuse anybody who arrived before it.
 */
export function subscriptionLiveOn(
  subscription: { status: string; startsOn: Date; endsOn: Date | null },
  date: Date,
): boolean {
  if (subscription.status !== "ACTIVE") return false;

  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const from = Date.UTC(
    subscription.startsOn.getFullYear(),
    subscription.startsOn.getMonth(),
    subscription.startsOn.getDate(),
  );
  if (day < from) return false;

  if (!subscription.endsOn) return true;
  const to = Date.UTC(
    subscription.endsOn.getFullYear(),
    subscription.endsOn.getMonth(),
    subscription.endsOn.getDate(),
  );
  return day <= to;
}

export type Entitlement = {
  /** Whether the plan pays. False still serves; it just charges. */
  covered: boolean;
  basis: "PLAN" | "CASH";
  chargeMinor: number;
  /** Shown at the counter so somebody can say why there is a charge. */
  note: string;
};

/**
 * What happens when this person reaches the counter.
 *
 * Nobody is ever refused. A child whose plan lapsed because their fees are
 * unpaid still eats, and the school has a record of what that cost. The
 * alternative is a system that sends children away from lunch over a billing
 * question, which is not a thing a school should be able to do by accident.
 */
export function entitlement(
  subscription: SubscriptionLike | null,
  sitting: string,
  date: Date,
  fallbackPerMealMinor = 0,
): Entitlement {
  if (subscription && subscriptionLiveOn(subscription, date)) {
    if (planCovers(subscription.plan, sitting)) {
      return { covered: true, basis: "PLAN", chargeMinor: 0, note: "On their meal plan" };
    }
    return {
      covered: false,
      basis: "CASH",
      chargeMinor: subscription.plan.perMealMinor,
      note: `Their plan does not include ${sittingLabel(sitting).toLowerCase()}`,
    };
  }

  if (subscription && subscription.status === "SUSPENDED") {
    return {
      covered: false,
      basis: "CASH",
      chargeMinor: subscription.plan.perMealMinor || fallbackPerMealMinor,
      note: "Their plan is suspended",
    };
  }

  return {
    covered: false,
    basis: "CASH",
    chargeMinor: fallbackPerMealMinor,
    note: "No meal plan",
  };
}

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

export type ServedLike = {
  basis: string;
  chargedMinor: number;
  studentId?: string | null;
  staffId?: string | null;
};

export type ServiceTotals = {
  served: number;
  students: number;
  staff: number;
  guests: number;
  onPlan: number;
  paid: number;
  takingsMinor: number;
};

export function serviceTotals(records: ServedLike[]): ServiceTotals {
  const totals: ServiceTotals = {
    served: records.length,
    students: 0,
    staff: 0,
    guests: 0,
    onPlan: 0,
    paid: 0,
    takingsMinor: 0,
  };

  for (const record of records) {
    if (record.studentId) totals.students += 1;
    else if (record.staffId) totals.staff += 1;
    else totals.guests += 1;

    if (record.basis === "PLAN") totals.onPlan += 1;
    if (record.chargedMinor > 0) {
      totals.paid += 1;
      totals.takingsMinor += record.chargedMinor;
    }
  }

  return totals;
}

/**
 * The difference between who was entitled and who came.
 *
 * Positive means people who could have eaten did not, which for a boarding
 * school is a welfare question before it is a catering one: a boarder who
 * missed supper is a boarder nobody has seen since lunch.
 */
export function absentFromService(expectedCount: number, records: ServedLike[]): number {
  const onPlan = records.filter((record) => record.basis === "PLAN").length;
  return Math.max(0, expectedCount - onPlan);
}

/**
 * Subscriptions with a termly charge that has not reached an invoice.
 *
 * Ended and suspended plans are included when they were live for part of the
 * term, because the family owes for the part they used. What is excluded is a
 * plan already charged, so running the billing twice in one afternoon does not
 * bill the term twice.
 */
export function unbilledSubscriptions<
  T extends { status: string; chargedAt: Date | null; plan: { priceMinor: number } },
>(subscriptions: T[]): T[] {
  return subscriptions.filter(
    (subscription) => !subscription.chargedAt && subscription.plan.priceMinor > 0,
  );
}

/** The total a billing run is about to raise, so it can be shown first. */
export function billingTotalMinor(
  subscriptions: Array<{ plan: { priceMinor: number } }>,
): number {
  return subscriptions.reduce(
    (sum, subscription) => sum + subscription.plan.priceMinor,
    0,
  );
}
