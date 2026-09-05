/**
 * The termly report to the board: how a figure is allowed to be stated.
 *
 * Every number in this system already exists on a screen somewhere. What does
 * not exist is the document a proprietor or a governing board actually
 * receives, and so it gets assembled by hand the week before the meeting, out
 * of six screens and a calculator. The figures in board papers therefore
 * disagree with the software that produced them, quietly and routinely, and
 * nobody can tell which is wrong because neither says where it came from.
 *
 * So this module is mostly about three rules.
 *
 * A figure carries its basis. Not "attendance 94%" but "94%, of sessions
 * actually marked, second term". A board member who cannot see what was
 * counted cannot challenge it, and a figure nobody can challenge is not
 * evidence, it is decoration.
 *
 * A figure that cannot be computed honestly says so. Zero is a fact and a
 * blank is an absence, and printing one for the other is how a board is told
 * the school spent nothing on repairs when what happened is that nobody
 * recorded any. Every unavailable figure carries the reason it is missing.
 *
 * A comparison is only drawn where it is fair. Four weeks of this term against
 * a whole one is not a decline, and the arithmetic that says it is will be
 * read out loud in a meeting.
 */

// ---------------------------------------------------------------------------
// A figure
// ---------------------------------------------------------------------------

export type Figure = {
  label: string;
  /**
   * The figure, already worded and formatted. Null when it could not be
   * computed, in which case `missing` says why.
   */
  value: string | null;
  /** What was counted, and over what. Printed under the figure, small. */
  basis: string;
  /** Why there is no figure. Null when there is one. */
  missing: string | null;
  /** A comparison with the same figure last time, where one is fair. */
  change: Change | null;
};

export function figure(label: string, value: string, basis: string): Figure {
  return { label, value, basis, missing: null, change: null };
}

/**
 * A figure the school cannot honestly state.
 *
 * Deliberately not a zero. "Nothing was spent on repairs" and "nobody recorded
 * any repairs" are different sentences, and a board that is given the first
 * when the second is true will plan next year around it.
 */
export function unavailable(label: string, why: string): Figure {
  return { label, value: null, basis: "", missing: why, change: null };
}

export function withChange(subject: Figure, change: Change | null): Figure {
  return { ...subject, change };
}

// ---------------------------------------------------------------------------
// Comparisons
// ---------------------------------------------------------------------------

export type Direction = "up" | "down" | "level";

export type Change = {
  direction: Direction;
  /** "up 12" or "up 12%" or "up from nothing". Already worded. */
  wording: string;
  /** The raw difference, for anything that wants to colour it. */
  delta: number;
};

/**
 * What kind of number is being compared.
 *
 * The caller has to say, because one function cannot word both honestly.
 * Attendance of 94 against 91 is up three POINTS; a roll of 94 against 91 is
 * up three per cent. Reported the other way round the first becomes "up 3%",
 * which is the percentage-point confusion that lives in board papers
 * everywhere and is always read as the smaller number.
 */
export type Quantity = "count" | "points";

/**
 * This period against the last, worded rather than computed into a percentage
 * and left there.
 *
 * The percentage is the trap. A category that spent 200 cedis last term and
 * 1,400 this term is up 600%, which is true and tells a board nothing they
 * would not learn better from the two numbers; and a category that spent
 * nothing last term is up by infinity, which is how a board paper comes to
 * contain the word "Infinity". Small baselines get the plain difference, and a
 * baseline of nothing is said in words.
 */
export function change(
  now: number,
  before: number | null,
  quantity: Quantity = "count",
): Change | null {
  if (before === null) return null;

  const delta = Math.round((now - before) * 10) / 10;

  if (delta === 0) return { direction: "level", wording: "unchanged", delta: 0 };

  const direction: Direction = delta > 0 ? "up" : "down";
  const size = Math.abs(delta);

  // A rate is only ever compared in points. "94% against 91%" is three points,
  // and there is no reading of it on which it is three per cent.
  if (quantity === "points") {
    return {
      direction,
      wording: `${direction} ${size} ${size === 1 ? "point" : "points"}`,
      delta,
    };
  }

  if (before === 0) {
    return {
      direction,
      wording: direction === "up" ? `up from nothing` : `down from nothing`,
      delta,
    };
  }

  // Under twenty, a percentage of a small number reads as drama it is not.
  if (Math.abs(before) < 20) {
    return { direction, wording: `${direction} ${size}`, delta };
  }

  const percent = Math.round((size / Math.abs(before)) * 100);
  return { direction, wording: `${direction} ${percent}%`, delta };
}

/**
 * Whether two periods can fairly be compared.
 *
 * A term four weeks in against a whole term is not a decline in anything, and
 * the arithmetic that says it is will be read out in a meeting by somebody who
 * believes it. A tenth either way is the tolerance: terms in a Ghanaian school
 * year are not equal lengths and never have been.
 */
export function comparable(
  now: { days: number },
  before: { days: number } | null,
): boolean {
  if (!before) return false;
  if (now.days <= 0 || before.days <= 0) return false;
  const ratio = now.days / before.days;
  return ratio >= 0.9 && ratio <= 1.1;
}

// ---------------------------------------------------------------------------
// The arithmetic a board asks about
// ---------------------------------------------------------------------------

/**
 * What proportion of what was billed has been collected.
 *
 * Null when nothing was billed: a school that has not invoiced a term has not
 * collected 0% of it, and a red zero on a board paper starts a conversation
 * about the wrong thing.
 */
export function collectionRate(billedMinor: number, collectedMinor: number): number | null {
  if (billedMinor <= 0) return null;
  return Math.round((collectedMinor / billedMinor) * 1000) / 10;
}

/**
 * Spent and committed against the budget.
 *
 * Both, because the budget screen counts both and a board paper that counted
 * only invoices would disagree with the screen the bursar is looking at while
 * reading it out.
 */
export function budgetUse(
  budgetMinor: number | null,
  spentMinor: number,
  committedMinor: number,
): { usedMinor: number; leftMinor: number | null; percent: number | null } {
  const used = spentMinor + committedMinor;
  if (budgetMinor === null || budgetMinor <= 0) {
    return { usedMinor: used, leftMinor: null, percent: null };
  }
  return {
    usedMinor: used,
    leftMinor: budgetMinor - used,
    percent: Math.round((used / budgetMinor) * 1000) / 10,
  };
}

/** A rate over a denominator that may be nothing. */
export function rateOf(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export type Section = {
  key: string;
  title: string;
  /** One line saying what the section is for. Printed under the heading. */
  blurb: string;
  figures: Figure[];
  /** Sentences the assembler wants said under the figures. */
  notes?: string[];
};

/**
 * The order, and it is the order a board meeting runs in.
 *
 * Children first, because that is what the school is for and because a paper
 * that opens on money teaches a board to read the school as a business with
 * pupils in it. Money is third, after the teaching it pays for.
 */
export const SECTION_ORDER = [
  "enrolment",
  "attendance",
  "attainment",
  "teaching",
  "money",
  "staffing",
  "boarding",
  "admissions",
] as const;

export type SectionKey = (typeof SECTION_ORDER)[number];

export function orderSections(sections: Section[]): Section[] {
  const rank = new Map<string, number>(
    SECTION_ORDER.map((key, index) => [key as string, index]),
  );
  return [...sections].sort(
    (a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99),
  );
}

export type Completeness = {
  figures: number;
  stated: number;
  missing: number;
  /** The sentence that goes on the front, so nobody has to count. */
  wording: string;
};

/**
 * How much of the report the school could actually state.
 *
 * Printed on the front page. A board given twenty figures does not notice that
 * six of them are absent; told "twenty-six figures, twenty stated and six the
 * school cannot yet produce", it asks about the six, which is the whole
 * purpose of admitting them.
 */
export function completeness(sections: Section[]): Completeness {
  const all = sections.flatMap((section) => section.figures);
  const stated = all.filter((entry) => entry.value !== null).length;
  const missing = all.length - stated;

  return {
    figures: all.length,
    stated,
    missing,
    wording:
      all.length === 0
        ? "There is nothing in this report."
        : missing === 0
          ? `${all.length} figures, every one of them stated.`
          : `${all.length} figures: ${stated} stated, and ${missing} the school cannot yet produce honestly. Each of those says why.`,
  };
}

/**
 * How to name a gap, once, so both renderers say it the same way.
 *
 * "Attendance, Attendance" is what comes out when a section and its figure
 * share a name, which they do whenever a section has one headline number.
 * Saying it twice reads as a stutter in a document somebody is about to read
 * aloud in a meeting.
 */
export function gapLabel(gap: { section: string; label: string }): string {
  return gap.section === gap.label ? gap.section : `${gap.section}, ${gap.label}`;
}

/** Every gap, gathered, so the covering note can list them. */
export function gaps(sections: Section[]): Array<{ section: string; label: string; why: string }> {
  return sections.flatMap((section) =>
    section.figures
      .filter((entry) => entry.missing !== null)
      .map((entry) => ({
        section: section.title,
        label: entry.label,
        why: entry.missing as string,
      })),
  );
}

/** Sections with nothing in them are not printed as empty headings. */
export function printable(sections: Section[]): Section[] {
  return orderSections(sections).filter((section) => section.figures.length > 0);
}
