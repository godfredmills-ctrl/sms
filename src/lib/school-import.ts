/**
 * Reading a school out of another system's fee register.
 *
 * The source is one sheet of 1,461 rows: session, term, class, name, fees
 * required, fees paid, balance. No admission numbers, no dates of birth, no
 * guardians, no staff. Everything below is about turning that into a roster
 * without inventing anything that is not in it.
 *
 * ---------------------------------------------------------------------------
 * Names are the hard part, and cannot be fully solved here
 * ---------------------------------------------------------------------------
 *
 * The schema wants firstName and lastName; the register has one string. Ghana
 * writes names in more than one order, and this file has both:
 *
 *     Abdulai Mufti Nasara        surname first, which is the register's habit
 *     FAVOUR  ATINKAWAN           given name first, entered by a different hand
 *
 * Sorting settles it for the common case. Each class list runs Abdulai,
 * Abubakri, Abubarkar, Adom, Adom, Adomako: alphabetical by the FIRST token,
 * which is only true if the school treats that token as the surname. About one
 * name in ten breaks the run, and those are the ones entered the other way
 * round.
 *
 * So the first token becomes the surname, and every name is kept verbatim
 * alongside it. A split that is right nine times in ten and reversible is
 * worth more than a cleverer guess that cannot be checked, because the school
 * can correct a hundred names and cannot recover a thousand it never saw.
 * suspectOrder() marks the ones worth a human eye.
 *
 * ---------------------------------------------------------------------------
 * Two classes that are not classes
 * ---------------------------------------------------------------------------
 *
 * "Changed school" holds 57 pupils who have left, carried forward unchanged
 * into the new session, seventeen of whom ALSO sit in a real class. The old
 * system let both records stand. Leaving is the fact that matters, so it wins,
 * and the real class is kept as the last place they sat.
 *
 * "All Classes" is one pupil at zero fees. Not a class either.
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * "GHC 1,150.00" to 115000 pesewas, and "N/A" to null.
 *
 * Null is not zero. The register writes N/A for a balance of nothing and 0.00
 * for a fee nobody has set yet, and those become a settled account and an
 * unbilled pupil respectively. Collapsing them would bill 249 children for
 * nothing and call it correct.
 */
export function parseMoney(raw: string | null | undefined): number | null {
  const text = String(raw ?? "")
    .replace(/GH[CS₵]/i, "")
    .replace(/,/g, "")
    .trim();
  if (!text || /^n\/?a$/i.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Collapses the double spaces the export is full of. */
export function tidyName(raw: string): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

/**
 * ALL CAPS entries become title case; anything else is left exactly as typed.
 *
 * 457 of 731 names are shouted and the rest are not, and a school's letters
 * should not shout at two parents in five. Names already carrying case were
 * written deliberately, and Adu-Ameyaw, Salifu-N-Yeboah and O. all survive
 * only by being left alone.
 */
export function titleCase(name: string): string {
  const tidy = tidyName(name);
  if (tidy !== tidy.toUpperCase()) return tidy;
  return tidy
    .toLowerCase()
    .replace(
      /(^|[\s\-'’])([a-z])/g,
      (_match, lead: string, letter: string) => lead + letter.toUpperCase(),
    );
}

/** The comparison key for "is this the same child". Case and punctuation blind. */
export function studentKey(name: string): string {
  return tidyName(name)
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type SplitName = {
  lastName: string;
  firstName: string;
  otherNames: string | null;
};

/**
 * First token is the surname, second is the given name, the rest are other
 * names. A single-token name repeats it rather than leaving firstName empty,
 * which the schema forbids and a register would render as a blank column.
 *
 * Tokens with no letter in them are dropped before the split. Two entries in
 * this register separate the surname from the rest with a stray hyphen, as in
 * "ABDUL - FAILA ABUBARKAR", and taking the second token blindly gives a child
 * whose first name is "-". An initial like "B." is kept, because it has a
 * letter in it and is what the school actually wrote down.
 *
 * This is the one place the parts stop rebuilding the source exactly. That is
 * the right way round: the verbatim name is kept in the pupil's notes, so
 * nothing is lost, and no register prints a hyphen where a name should be.
 */
export function splitName(raw: string): SplitName {
  const parts = titleCase(raw)
    .split(" ")
    .filter((part) => /[A-Za-z]/.test(part));
  if (parts.length === 0) {
    return { lastName: "Unknown", firstName: "Unknown", otherNames: null };
  }
  if (parts.length === 1) {
    return { lastName: parts[0], firstName: parts[0], otherNames: null };
  }
  return {
    lastName: parts[0],
    firstName: parts[1],
    otherNames: parts.length > 2 ? parts.slice(2).join(" ") : null,
  };
}

/**
 * Names worth a second look, because the split above probably has them
 * backwards.
 *
 * A first token that is an unambiguous given name is the signal: the register
 * sorts by surname, so a given name in that position is a row entered the
 * other way round. Deliberately a short list rather than a clever heuristic.
 * This decides which names a human reviews, and a list that flags four hundred
 * is a list nobody reads.
 */
const GIVEN_NAME_FIRST = new Set([
  "AXEL",
  "FAVOUR",
  "ELEANOR",
  "JAYNA",
  "CONRAD",
  "MIGHTY",
  "OSWALD",
  "LORDSON",
  "MERCHIZDECK",
  "PRINCE",
  "PRINCESS",
  "GIFT",
  "BLESSING",
  "PRECIOUS",
  "GRACE",
  "JOY",
  "MERCY",
  "COMFORT",
  "PATIENCE",
  "EMMANUEL",
  "DANIEL",
  "DAVID",
  "JOHN",
  "MARY",
  "SARAH",
  "RUTH",
  "ESTHER",
  "ELIJAH",
  "ETHAN",
  "NATHANIEL",
  "JEREMY",
  "RANDY",
  "FELIX",
  "CLARA",
  "IMELDA",
  "MIRACLE",
]);

export function suspectOrder(raw: string): boolean {
  const parts = studentKey(raw).split(" ").filter(Boolean);
  if (parts.length < 2) return true;
  return GIVEN_NAME_FIRST.has(parts[0]);
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

export type Level = {
  code: string;
  name: string;
  sequence: number;
  stage: string;
};

/**
 * The ladder, in the order a child climbs it.
 *
 * Fourteen rungs, which is what the register contains. There is no JHS 3: JHS 2
 * itself only appeared this session, the year after JHS 1 did, because the
 * school is growing upwards one year at a time. JHS 3 is next year's problem
 * and is deliberately not invented here.
 */
export const LEVELS: Level[] = [
  { code: "CRECHE1", name: "Creche 1", sequence: 1, stage: "CRECHE" },
  { code: "CRECHE2", name: "Creche 2", sequence: 2, stage: "CRECHE" },
  { code: "NURSERY1", name: "Nursery 1", sequence: 3, stage: "NURSERY" },
  { code: "NURSERY2", name: "Nursery 2", sequence: 4, stage: "NURSERY" },
  { code: "KG1", name: "KG 1", sequence: 5, stage: "KINDERGARTEN" },
  { code: "KG2", name: "KG 2", sequence: 6, stage: "KINDERGARTEN" },
  { code: "BASIC1", name: "Basic 1", sequence: 7, stage: "PRIMARY" },
  { code: "BASIC2", name: "Basic 2", sequence: 8, stage: "PRIMARY" },
  { code: "BASIC3", name: "Basic 3", sequence: 9, stage: "PRIMARY" },
  { code: "BASIC4", name: "Basic 4", sequence: 10, stage: "PRIMARY" },
  { code: "BASIC5", name: "Basic 5", sequence: 11, stage: "PRIMARY" },
  { code: "BASIC6", name: "Basic 6", sequence: 12, stage: "PRIMARY" },
  { code: "JHS1", name: "JHS 1", sequence: 13, stage: "JHS" },
  { code: "JHS2", name: "JHS 2", sequence: 14, stage: "JHS" },
];

/** Rows whose "class" is a status the old system had nowhere else to put. */
export const LEFT_THE_SCHOOL = "CHANGED SCHOOL";
export const UNPLACED = "ALL CLASSES";

function classKey(cls: string): string {
  return String(cls ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function levelFor(cls: string): Level | null {
  const key = classKey(cls);
  if (key === LEFT_THE_SCHOOL || key === UNPLACED) return null;
  return (
    LEVELS.find((level) => level.code === key.replace(/\s+/g, "")) ??
    LEVELS.find((level) => level.name.toUpperCase() === key) ??
    null
  );
}

export function isPseudoClass(cls: string): boolean {
  const key = classKey(cls);
  return key === LEFT_THE_SCHOOL || key === UNPLACED;
}

// ---------------------------------------------------------------------------
// Who is who, once the duplicates are resolved
// ---------------------------------------------------------------------------

export type SourceRow = {
  session: string;
  term: string;
  cls: string;
  name: string;
  requiredMinor: number | null;
  paidMinor: number | null;
};

export type Resolved = {
  key: string;
  /** The name as the register wrote it, kept so nothing is lost. */
  sourceName: string;
  /** Null when they have left, or were never placed. */
  levelCode: string | null;
  hasLeft: boolean;
  /** Where they last sat, even if they have since left. */
  lastLevelCode: string | null;
};

/**
 * One record per child for a session, from rows that may contradict each other.
 *
 * Seventeen children sit in a real class AND in "Changed school" in the same
 * session. Leaving wins, because a school that bills a departed pupil has a
 * conversation to have, and a school that does not bill a present one finds
 * out within the week. The class is still recorded, as the last place they sat.
 */
export function resolveSession(rows: SourceRow[]): Resolved[] {
  const byKey = new Map<string, Resolved>();

  for (const row of rows) {
    const key = studentKey(row.name);
    if (!key) continue;

    const level = levelFor(row.cls);
    const left = classKey(row.cls) === LEFT_THE_SCHOOL;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        sourceName: tidyName(row.name),
        levelCode: level?.code ?? null,
        hasLeft: left,
        lastLevelCode: level?.code ?? null,
      });
      continue;
    }

    if (left) existing.hasLeft = true;
    if (level && !existing.lastLevelCode) existing.lastLevelCode = level.code;
    if (level && !existing.levelCode) existing.levelCode = level.code;
  }

  // A leaver is enrolled nowhere, whatever else the sheet said about them.
  for (const entry of byKey.values()) {
    if (entry.hasLeft) entry.levelCode = null;
  }

  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// What a level charges
// ---------------------------------------------------------------------------

/**
 * The fee a level charges, from what its pupils were actually billed.
 *
 * The mode, not the mean. Most of a level pays the standard rate, a few pay
 * half it (siblings and staff children), and one pays 2,332 for reasons the
 * register does not record. An average of those is a number no child was ever
 * charged; the most common value is the school's actual rate.
 *
 * Zero is not a rate. Where a whole level reads zero the fee has not been set
 * in the old system yet, and that is a gap to report rather than a fee to
 * charge. Returns null, and the caller decides what to carry forward.
 */
export function modalFee(amounts: Array<number | null>): number | null {
  const counts = new Map<number, number>();
  for (const amount of amounts) {
    if (amount === null || amount <= 0) continue;
    counts.set(amount, (counts.get(amount) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let best: number | null = null;
  let bestCount = 0;
  // Ties go to the larger amount, so a school never under-charges by accident.
  for (const [amount, count] of [...counts.entries()].sort((a, b) => b[0] - a[0])) {
    if (count > bestCount) {
      best = amount;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Whether a level's stated rate is large enough to be a term's tuition.
 *
 * Basic 2 reads 210 for 58 of its 62 pupils this session: frequent enough to
 * look deliberate, and far too small to be a term of school. A floor on the
 * amount catches what a floor on the count cannot, and 300 cedis is comfortably
 * below any real termly fee in this register and comfortably above the stray
 * part-payments that reached the fee column.
 */
export function looksLikeATermFee(minor: number | null): boolean {
  return minor !== null && minor >= 30_000;
}
