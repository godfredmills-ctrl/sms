/**
 * The alumni register's arithmetic, with no database in sight.
 *
 * Two ideas run through all of it. The first is that a contact detail has an
 * age: a register of nine hundred names last checked in 2019 reads as nine
 * hundred contactable alumni and is closer to two hundred, and the only honest
 * way to say so is to date every one and count the stale ones out loud. The
 * second is that consent is a fact with a date, not a mood. Both are the sort
 * of thing that gets quietly dropped when a screen needs a bigger number.
 */

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------

/** "Class of 2018", which is how every alumni event is organised. */
export function cohortLabel(year: number): string {
  return `Class of ${year}`;
}

/**
 * How long ago they left, as of a given day.
 *
 * Takes "now" rather than reading the clock, so the same input always gives
 * the same answer and a test does not go stale on the first of January.
 */
export function yearsSince(graduationYear: number, now: Date): number {
  return Math.max(0, now.getFullYear() - graduationYear);
}

/**
 * The reunion years a school actually holds: five, ten, twenty, twenty-five,
 * fifty. Anniversaries in between are birthdays, not reunions.
 */
export const REUNION_YEARS = [5, 10, 15, 20, 25, 30, 40, 50] as const;

/** Cohorts hitting a reunion year in the year given. */
export function cohortsDueAReunion(years: number[], now: Date): Array<{ year: number; milestone: number }> {
  const due: Array<{ year: number; milestone: number }> = [];
  for (const year of [...new Set(years)].sort((a, b) => b - a)) {
    const since = yearsSince(year, now);
    if (REUNION_YEARS.includes(since as never)) due.push({ year, milestone: since });
  }
  return due;
}

// ---------------------------------------------------------------------------
// Contactability
// ---------------------------------------------------------------------------

/**
 * How long a contact detail is trusted before somebody should check it again.
 *
 * Two years is a judgement rather than a law. It is roughly how long a Ghanaian
 * mobile number survives untouched, and short enough that a register is checked
 * more than once a decade.
 */
export const VERIFY_AFTER_DAYS = 730;

export type AlumnusLike = {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  consentToContact: boolean;
  consentAt: Date | null;
  verifiedAt: Date | null;
  deceasedOn: Date | null;
};

export type Reachability = {
  /** Whether the school may write to them at all. */
  mayContact: boolean;
  /** Whether there is anything to write to. */
  hasChannel: boolean;
  /** Both of the above, and the details are not stale. */
  reachable: boolean;
  /** Days since somebody last confirmed the details, or null if never. */
  ageDays: number | null;
  stale: boolean;
  /** One sentence a screen can print without composing it itself. */
  reason: string;
};

function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * Whether the school can actually reach this person, and if not, why not.
 *
 * The reasons are ordered by what a member of staff should do about them.
 * Deceased first, because everything else is irrelevant and writing to them
 * would be the worst thing this module could do. Then consent, because no
 * amount of correct contact detail makes an unconsented mailing lawful. Then
 * whether there is any channel at all, then whether it has gone stale.
 */
export function reachability(alumnus: AlumnusLike, now: Date): Reachability {
  const hasChannel = Boolean(alumnus.email || alumnus.phone || alumnus.whatsapp);
  const ageDays = alumnus.verifiedAt ? daysBetween(alumnus.verifiedAt, now) : null;
  const stale = ageDays === null || ageDays > VERIFY_AFTER_DAYS;

  if (alumnus.deceasedOn) {
    return {
      mayContact: false,
      hasChannel,
      reachable: false,
      ageDays,
      stale,
      reason: "Recorded as deceased",
    };
  }

  // Consent without a date cannot be evidenced, which is the same as not
  // having it. The database refuses that combination; this is what a screen
  // says if one ever arrives from an import.
  const consented = alumnus.consentToContact && Boolean(alumnus.consentAt);

  if (!consented) {
    return {
      mayContact: false,
      hasChannel,
      reachable: false,
      ageDays,
      stale,
      reason: alumnus.consentToContact
        ? "Consent recorded with no date, so it cannot be evidenced"
        : "Has not agreed to be contacted",
    };
  }

  if (!hasChannel) {
    return {
      mayContact: true,
      hasChannel: false,
      reachable: false,
      ageDays,
      stale,
      reason: "No email, phone or WhatsApp on file",
    };
  }

  if (stale) {
    return {
      mayContact: true,
      hasChannel: true,
      reachable: false,
      ageDays,
      stale: true,
      reason:
        ageDays === null
          ? "Contact details have never been confirmed"
          : `Contact details last confirmed ${Math.floor(ageDays / 365)} years ago`,
    };
  }

  return {
    mayContact: true,
    hasChannel: true,
    reachable: true,
    ageDays,
    stale: false,
    reason: "Reachable",
  };
}

export type RegisterHealth = {
  total: number;
  /** Consented, contactable, and confirmed within the window. */
  reachable: number;
  /** Consented and contactable, but the details are old. */
  stale: number;
  /** Has not agreed to be contacted. */
  noConsent: number;
  /** Agreed, but there is nothing to write to. */
  noChannel: number;
  deceased: number;
};

/**
 * What the register is actually worth.
 *
 * Written as one function because the temptation on a dashboard is to show the
 * total and call it the mailing list. The difference between those two numbers
 * is the number worth showing.
 */
export function registerHealth(alumni: AlumnusLike[], now: Date): RegisterHealth {
  const health: RegisterHealth = {
    total: alumni.length,
    reachable: 0,
    stale: 0,
    noConsent: 0,
    noChannel: 0,
    deceased: 0,
  };

  for (const alumnus of alumni) {
    const state = reachability(alumnus, now);
    if (alumnus.deceasedOn) health.deceased += 1;
    else if (!state.mayContact) health.noConsent += 1;
    else if (!state.hasChannel) health.noChannel += 1;
    else if (state.stale) health.stale += 1;
    else health.reachable += 1;
  }

  return health;
}

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------

export const ENGAGEMENTS = [
  { value: "DONATION", label: "Donation", weight: 5 },
  { value: "SPEAKING", label: "Spoke at the school", weight: 4 },
  { value: "MENTORING", label: "Mentored a pupil", weight: 4 },
  { value: "PLACEMENT", label: "Offered a placement", weight: 4 },
  { value: "EVENT", label: "Came to an event", weight: 2 },
  { value: "UPDATE", label: "Sent an update", weight: 1 },
  { value: "OTHER", label: "Other", weight: 1 },
] as const;

export type EngagementKind = (typeof ENGAGEMENTS)[number]["value"];

export const ENGAGEMENT_VALUES: string[] = ENGAGEMENTS.map((entry) => entry.value);

export function engagementLabel(value: string): string {
  return ENGAGEMENTS.find((entry) => entry.value === value)?.label ?? value;
}

/** Only a donation carries money. The database enforces it; this names it. */
export function carriesMoney(kind: string): boolean {
  return kind === "DONATION";
}

export type EngagementLike = {
  kind: string;
  happenedOn: Date;
  amountMinor: number;
};

/**
 * How involved somebody is, as one number, so a list can be sorted by it.
 *
 * Weighted by what the act costs the person rather than what it is worth to
 * the school, and decayed over five years. Somebody who mentored a pupil last
 * term is more use to the school than somebody who came to a dinner in 2011,
 * and a raw count says the opposite.
 *
 * Deliberately not weighted by the size of a donation. A register sorted by
 * who gave the most is a register that stops seeing everybody else, and the
 * person who gives their Saturdays is the one a school actually runs on.
 */
export function engagementScore(engagements: EngagementLike[], now: Date): number {
  let score = 0;

  for (const engagement of engagements) {
    const weight =
      ENGAGEMENTS.find((entry) => entry.value === engagement.kind)?.weight ?? 1;
    const years = daysBetween(engagement.happenedOn, now) / 365;
    // Full weight this year, tapering to nothing at five.
    const decay = Math.max(0, 1 - years / 5);
    score += weight * decay;
  }

  return Math.round(score * 10) / 10;
}

export type DonationTotals = {
  count: number;
  totalMinor: number;
  largestMinor: number;
  donors: number;
};

/** Donations only, whatever else is in the list. */
export function donationTotals(
  engagements: Array<EngagementLike & { alumnusId?: string }>,
): DonationTotals {
  const donations = engagements.filter((entry) => entry.kind === "DONATION");
  const donors = new Set(
    donations.map((entry) => entry.alumnusId ?? "").filter(Boolean),
  );

  return {
    count: donations.length,
    totalMinor: donations.reduce((sum, entry) => sum + entry.amountMinor, 0),
    largestMinor: donations.reduce((most, entry) => Math.max(most, entry.amountMinor), 0),
    donors: donors.size,
  };
}

// ---------------------------------------------------------------------------
// Bringing leavers forward
// ---------------------------------------------------------------------------

export type LeaverLike = {
  id: string;
  status: string;
  /** Already on the register. */
  hasAlumnusRecord: boolean;
};

/** The statuses that mean somebody has left with the school's blessing. */
export const LEAVING_STATUSES = ["GRADUATED", "ALUMNI"] as const;

/**
 * Which leavers are not yet on the register.
 *
 * Transferred out and withdrawn are excluded on purpose. A child who left in
 * Primary 4 because the family moved to Kumasi is not an old boy of this
 * school, and putting them on the register turns a list of people with a
 * connection into a list of everybody who ever passed through. A school that
 * disagrees can add them by hand, which is a decision rather than a default.
 */
export function leaversToRegister<T extends LeaverLike>(leavers: T[]): T[] {
  return leavers.filter(
    (leaver) =>
      !leaver.hasAlumnusRecord &&
      LEAVING_STATUSES.includes(leaver.status as never),
  );
}

/**
 * The year to file a leaver under.
 *
 * A Ghanaian school year runs September to July, so somebody finishing in
 * June 2026 is the class of 2026 and somebody leaving in October 2026 is the
 * class of 2027. Taking the calendar year of their last day would split one
 * cohort across two reunions.
 */
export function graduationYearFor(lastDay: Date): number {
  // August onwards belongs to the year that ends the following July.
  return lastDay.getMonth() >= 7 ? lastDay.getFullYear() + 1 : lastDay.getFullYear();
}
