/**
 * Gates that more than one surface has to agree about.
 *
 * A permission on its own is not always the whole question, and when it is
 * not, the question gets asked in as many places as there are ways in. The
 * clinic day-book found that out the hard way: the page allowed
 * student.medical.read AND (student.read OR student.medical.update), and the
 * two other doors to it each asked something simpler.
 *
 *   The sidebar asked for student.medical.read, which every teacher holds, so
 *   it offered the link to the whole common room and the page answered 404.
 *
 *   The dashboard panel asked the same, and did not 404: it drew a summary of
 *   the day, with the children named and their complaints beside them, to
 *   anybody who could see an allergy on their own class list.
 *
 * Three readings of one rule, two of them wrong, and the wrong one that did
 * not error was the one that mattered. So the rule is written down once, here,
 * as data that all three read: the page enforces it, the sidebar draws a
 * padlock from it, the dashboard decides whether the panel exists at all.
 *
 * Pure and dependency-free, because the client imports it.
 */

export type Gate = {
  /** Any one of these opens it. Absent or empty means everybody signed in. */
  permissions?: string[];
  /** And every one of these as well. */
  all?: string[];
};

/** Whether somebody holding these permissions passes a gate. */
export function passes(gate: Gate, holds: (permission: string) => boolean): boolean {
  if (gate.all && !gate.all.every(holds)) return false;
  if (!gate.permissions || gate.permissions.length === 0) return true;
  return gate.permissions.some(holds);
}

/** The same question, asked of a set rather than a predicate. */
export function passesWith(gate: Gate, held: Set<string> | string[]): boolean {
  const set = held instanceof Set ? held : new Set(held);
  return passes(gate, (permission) => set.has(permission));
}

/**
 * The clinic day-book: every visit in the school, with names and complaints.
 *
 * A teacher holds student.medical.read so that an allergy shows on their own
 * class list. It is not a licence to read what the whole school came to the
 * san about. The book belongs to the nurse, who logs the visits, and to the
 * office and the head, who can already see every child.
 *
 * A house parent is deliberately not here. They reach a boarder's medical
 * record through the pupil, which is their own boarders and no further, and
 * that is the right shape for a question about one child at ten at night.
 */
export const CLINIC_DAYBOOK: Gate = {
  permissions: ["student.read", "student.medical.update"],
  all: ["student.medical.read"],
};
