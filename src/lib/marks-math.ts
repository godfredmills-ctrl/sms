/**
 * How a subject mark is built out of its components.
 *
 * Pure arithmetic, no database, no server-only import — because the two places
 * that need it are a server module that generates report cards and a client
 * component that shows a teacher the running total as they type. Those two had
 * written the formula separately, and both had the same bug in it.
 *
 * **An absence is not a zero.** A pupil who was ill on the morning of the exam
 * has not scored nothing; there is no score. Counting it as zero and then
 * still charging its full weight to the denominator is a hard zero by a longer
 * route — it dragged the pupil's own total, and because the class average and
 * every position are computed from those totals, it dragged the whole class
 * down with them and moved everybody's rank. On paper it printed "0.0" in the
 * Exam column, indistinguishable from a pupil who sat the paper and scored
 * nothing.
 *
 * So an absence is skipped on both sides of the fraction, and the weight it
 * would have carried is remembered separately, so the report card can print
 * "Abs" rather than a number that is not true.
 *
 * The three states a component can be in are genuinely different and stay
 * different:
 *
 *   absent   — expected, did not come. Skipped, and said so on the card.
 *   exempt   — never expected to sit it. Skipped, silently.
 *   unmarked — nobody has entered a mark yet. Skipped, and the total is
 *              provisional. This is the state a term is in until marking ends.
 */

export type Component = {
  /** What the paper was marked out of. */
  maxScore: number;
  /** Share of the subject mark this component carries, as a percentage. */
  weight: number;
  isExam: boolean;
  score: number | null;
  isAbsent: boolean;
  isExempt: boolean;
};

export type Weighted = {
  /** The CA sub-total, out of the CA weight that was actually used. */
  caScore: number | null;
  caWeight: number;
  examScore: number | null;
  examWeight: number;
  /** The subject mark, renormalised over the components that exist. */
  totalScore: number | null;
  /** Every exam component was an absence — so "Abs", not a number. */
  examAbsent: boolean;
  caAbsent: boolean;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function weightSubject(components: Component[]): Weighted {
  let caWeighted = 0;
  let caWeight = 0;
  let examWeighted = 0;
  let examWeight = 0;
  // The weight an absence would have carried, kept so the difference between
  // "absent" and "no such component" survives to the printed card.
  let absentCaWeight = 0;
  let absentExamWeight = 0;

  for (const component of components) {
    // Never expected to sit it: out of the numerator and the denominator, and
    // not remarked on. This is already how the old code treated exempt, and it
    // was already right.
    if (component.isExempt) continue;
    if (component.weight <= 0) continue;

    if (component.isAbsent) {
      if (component.isExam) absentExamWeight += component.weight;
      else absentCaWeight += component.weight;
      continue;
    }

    // No mark entered yet. Not a zero either — a term half-marked would
    // otherwise show every pupil failing until the last paper is entered.
    if (component.score === null) continue;

    const percent =
      component.maxScore > 0 ? (component.score / component.maxScore) * 100 : 0;

    if (component.isExam) {
      examWeighted += (percent * component.weight) / 100;
      examWeight += component.weight;
    } else {
      caWeighted += (percent * component.weight) / 100;
      caWeight += component.weight;
    }
  }

  const usedWeight = caWeight + examWeight;

  return {
    caScore: caWeight > 0 ? round1(caWeighted) : null,
    caWeight,
    examScore: examWeight > 0 ? round1(examWeighted) : null,
    examWeight,
    // Renormalised over what exists, so a term with the exam still to come
    // gives a meaningful CA-only mark rather than half of one.
    totalScore:
      usedWeight > 0 ? round1(((caWeighted + examWeighted) / usedWeight) * 100) : null,
    examAbsent: examWeight === 0 && absentExamWeight > 0,
    caAbsent: caWeight === 0 && absentCaWeight > 0,
  };
}

/**
 * What to print in a score cell.
 *
 * Three outcomes that look alike as numbers and are not alike at all: a mark,
 * an absence, and a component that does not exist. Shared by the PDF, the web
 * report card and the pupil's portal, because three renderers each writing
 * `score?.toFixed(1) ?? "—"` is three chances to print a zero for an absence.
 */
export function formatScoreCell(
  score: number | null | undefined,
  options?: { absent?: boolean; decimals?: number },
): string {
  if (score === null || score === undefined) return options?.absent ? "Abs" : "—";
  return score.toFixed(options?.decimals ?? 1);
}
