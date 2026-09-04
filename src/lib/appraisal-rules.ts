/**
 * Staff appraisal: the judgement, and the facts underneath it.
 *
 * Every part of this system already holds evidence about how a teacher's year
 * has gone. Lesson notes handed in and vetted. Registers taken, and when.
 * Cover taken on for absent colleagues. Days out, and how much notice. At the
 * end of a year a head sits down to write an appraisal and works from memory
 * and a folder, because none of it has ever been in one place.
 *
 * So this module puts it in one place, and then does the harder thing, which
 * is to stop.
 *
 * ---------------------------------------------------------------------------
 * The evidence is not a score, and this module will not turn it into one.
 * ---------------------------------------------------------------------------
 *
 * It would be four lines of arithmetic to average the lesson-note compliance
 * and the register punctuality and print a number, and it would be worse than
 * useless. A teacher whose notes are late every week because they are teaching
 * four classes in a school that is two staff short is not a worse teacher than
 * a colleague with two classes and immaculate paperwork; a register taken at
 * 08:05 rather than 08:00 is not a fact about teaching at all. Ratings come
 * from a person who has been in the room. What the system contributes is that
 * the person doing the rating is not guessing about what happened.
 *
 * Hence: evidence() returns sentences, each labelled with what it counted and
 * over what period, and nothing here maps any of them to a rating.
 *
 * The other rule with teeth is that an appraisal has two voices. The appraisee
 * writes first and may record disagreement at the end, in their own words, and
 * that disagreement is part of the record. A document with one signature on it
 * is not an appraisal; it is a report about somebody.
 */

// ---------------------------------------------------------------------------
// What is being appraised
// ---------------------------------------------------------------------------

export const CRITERIA = [
  {
    key: "knowledge",
    label: "Subject knowledge",
    hint: "Command of the subject and of the syllabus being taught.",
  },
  {
    key: "preparation",
    label: "Preparation and planning",
    hint: "Lesson notes, schemes of work, and materials ready before the lesson.",
  },
  {
    key: "delivery",
    label: "Teaching and delivery",
    hint: "How the lesson is carried, and whether the class is with it.",
  },
  {
    key: "assessment",
    label: "Assessment and feedback",
    hint: "Marking, its timeliness, and what pupils are told about their work.",
  },
  {
    key: "management",
    label: "Classroom management",
    hint: "Order, routine, and how the room runs when something goes wrong.",
  },
  {
    key: "punctuality",
    label: "Punctuality and attendance",
    hint: "Being where the timetable says, at the time it says.",
  },
  {
    key: "conduct",
    label: "Professional conduct",
    hint: "Relationships with pupils, colleagues and families.",
  },
  {
    key: "contribution",
    label: "Beyond the classroom",
    hint: "Clubs, duties, cover taken on, and the work nobody is timetabled for.",
  },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

export function criterionLabel(key: string): string {
  return CRITERIA.find((criterion) => criterion.key === key)?.label ?? key;
}

/**
 * The scale, four points and no middle.
 *
 * An odd-numbered scale collects everybody in the centre: on a five-point
 * scale most of a staff room is a three, which is a way of writing an
 * appraisal without making a judgement. Four forces a side, and the two sides
 * are useful ones: better than expected, or not yet where it needs to be.
 */
export const RATINGS = [
  {
    value: 4,
    label: "Outstanding",
    tone: "success",
    hint: "Better than the school expects, and others could learn from it.",
  },
  {
    value: 3,
    label: "Good",
    tone: "success",
    hint: "What the school expects, done well.",
  },
  {
    value: 2,
    label: "Developing",
    tone: "warning",
    hint: "Not yet where it needs to be, and improving with support.",
  },
  {
    value: 1,
    label: "Needs attention",
    tone: "danger",
    hint: "A concern, and the subject of a target below.",
  },
] as const;

export type Rating = (typeof RATINGS)[number]["value"];

export function ratingLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not rated";
  return RATINGS.find((rating) => rating.value === value)?.label ?? String(value);
}

export function ratingTone(value: number | null | undefined): string {
  if (value === null || value === undefined) return "neutral";
  return RATINGS.find((rating) => rating.value === value)?.tone ?? "neutral";
}

export function isRating(value: unknown): value is Rating {
  return RATINGS.some((rating) => rating.value === value);
}

// ---------------------------------------------------------------------------
// The overall picture
// ---------------------------------------------------------------------------

export type Score = { criterion: string; rating: number | null };

export type Overall = {
  rated: number;
  of: number;
  /** The mean of what has been rated, to one decimal. Null until all are. */
  average: number | null;
  /** The band that mean falls in. Null until all are rated. */
  band: string | null;
  complete: boolean;
};

/**
 * The overall, which does not exist until every criterion is rated.
 *
 * Deliberately null rather than an average of what happens to be filled in.
 * Half an appraisal averaged is a number that looks exactly like a whole one,
 * and the half that is missing is reliably the half somebody was avoiding.
 */
export function overall(scores: Score[]): Overall {
  const known = scores.filter((score) => isRating(score.rating));
  const of = CRITERIA.length;

  if (known.length < of) {
    return { rated: known.length, of, average: null, band: null, complete: false };
  }

  const mean = known.reduce((sum, score) => sum + (score.rating as number), 0) / known.length;

  /*
   * Banded on the true mean, displayed at one decimal.
   *
   * The first version banded the rounded figure, and seven outstandings with
   * one developing is 3.75, which rounds to 3.8, which the boundary below
   * calls outstanding. The comment on that boundary says in as many words
   * that it must not, and the rounding put it back. Round for the reader;
   * decide on the number.
   */
  return {
    rated: known.length,
    of,
    average: Math.round(mean * 10) / 10,
    band: bandFor(mean),
    complete: true,
  };
}

/**
 * The word for an average.
 *
 * The boundaries sit where they do so that a single "needs attention" among
 * sevens of "good" cannot be rounded into a clean report: 3.75 is not
 * outstanding, and a school that lets it be has a scale that only goes up.
 */
export function bandFor(average: number): string {
  if (average >= 3.8) return "Outstanding";
  if (average >= 3.0) return "Good";
  if (average >= 2.0) return "Developing";
  return "Needs attention";
}

/** Criteria nobody has rated yet, by label. */
export function unrated(scores: Score[]): string[] {
  const rated = new Set(
    scores.filter((score) => isRating(score.rating)).map((score) => score.criterion),
  );
  return CRITERIA.filter((criterion) => !rated.has(criterion.key)).map(
    (criterion) => criterion.label,
  );
}

// ---------------------------------------------------------------------------
// The evidence
// ---------------------------------------------------------------------------

export type Facts = {
  /** Lesson notes handed in, of those expected for the period. */
  lessonNotes: { handedIn: number; expected: number; late: number } | null;
  /**
   * Registers marked. A count, with no denominator, and deliberately.
   *
   * The first version had "taken of expected", and expected was a guess: how
   * many registers a teacher owes depends on which classes hold one, whether a
   * day has a morning and an afternoon session, and what the school does on a
   * games afternoon, none of which is modelled anywhere. A guessed denominator
   * printed beside somebody's name in an appraisal is worse than no figure at
   * all, because it reads exactly like a measured one.
   */
  registers: { taken: number } | null;
  /** Periods of cover taken on for absent colleagues. */
  coverTaken: number | null;
  /** Days of approved leave, and how many were unplanned. */
  leave: { days: number; sick: number } | null;
  /** Periods a week on the timetable. Context for all of the above. */
  teachingLoad: number | null;
};

export type Evidence = {
  label: string;
  /** The figure, already worded. */
  value: string;
  /** What it counted and over what period. */
  note: string;
};

/**
 * What the system knows, in sentences.
 *
 * Each one says what was counted, so that a figure cannot be read as more than
 * it is. "34 of 36 lesson notes" is a fact; "94%" invites a grade. Nothing
 * here is a rating and nothing here is combined with anything else: an
 * appraiser reads these and then makes up their own mind, which is the only
 * arrangement under which either of them means anything.
 *
 * A null is left out rather than shown as zero. A member of staff who does not
 * teach has no lesson notes, and a row reading "0 of 0" beside a librarian is
 * a fact about the software.
 */
export function evidence(facts: Facts, periodLabel: string): Evidence[] {
  const rows: Evidence[] = [];

  if (facts.teachingLoad !== null) {
    rows.push({
      label: "Timetabled teaching",
      value: `${facts.teachingLoad} ${facts.teachingLoad === 1 ? "period" : "periods"} a week`,
      note: "Context for everything below. Somebody teaching thirty periods and somebody teaching twelve are not doing the same job.",
    });
  }

  if (facts.lessonNotes) {
    const { handedIn, expected, late } = facts.lessonNotes;
    rows.push({
      label: "Lesson notes",
      value: `${handedIn} of ${expected} handed in`,
      note:
        late > 0
          ? `${late} after the week had started. ${periodLabel}.`
          : `None late. ${periodLabel}.`,
    });
  }

  if (facts.registers) {
    rows.push({
      label: "Registers",
      value: `${facts.registers.taken} marked`,
      note: `A count and not a proportion: how many were due is not held anywhere, so there is no honest figure to put it over. ${periodLabel}.`,
    });
  }

  if (facts.coverTaken !== null) {
    rows.push({
      label: "Cover taken on",
      value: `${facts.coverTaken} ${facts.coverTaken === 1 ? "period" : "periods"}`,
      note: `Lessons taught for absent colleagues. ${periodLabel}.`,
    });
  }

  if (facts.leave) {
    rows.push({
      label: "Days away",
      value: `${facts.leave.days} ${facts.leave.days === 1 ? "day" : "days"}`,
      note:
        facts.leave.sick > 0
          ? `${facts.leave.sick} of them sick leave. Approved leave only. ${periodLabel}.`
          : `Approved leave. ${periodLabel}.`,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Where it has got to
// ---------------------------------------------------------------------------

export const STATUSES = [
  {
    value: "DRAFT",
    label: "Not started",
    tone: "neutral",
    hint: "Opened for the period. The appraisee writes first.",
  },
  {
    value: "SELF_ASSESSED",
    label: "Self-assessment in",
    tone: "info",
    hint: "Written by the appraisee, and with the appraiser now.",
  },
  {
    value: "APPRAISED",
    label: "Appraised",
    tone: "warning",
    hint: "Rated and commented on. Waiting for the appraisee to respond.",
  },
  {
    value: "AGREED",
    label: "Agreed",
    tone: "success",
    hint: "Both have signed it. The targets stand.",
  },
  {
    value: "DISPUTED",
    label: "Not agreed",
    tone: "danger",
    hint: "The appraisee has recorded disagreement, in their own words.",
  },
] as const;

export type Status = (typeof STATUSES)[number]["value"];

export function statusLabel(value: string): string {
  return STATUSES.find((status) => status.value === value)?.label ?? value;
}

export function statusTone(value: string): string {
  return STATUSES.find((status) => status.value === value)?.tone ?? "neutral";
}

export function statusHint(value: string): string {
  return STATUSES.find((status) => status.value === value)?.hint ?? "";
}

export type Role = "appraisee" | "appraiser";

export const TRANSITIONS: Array<{
  from: Status;
  to: Status;
  by: Role;
  label: string;
}> = [
  { from: "DRAFT", to: "SELF_ASSESSED", by: "appraisee", label: "Send my self-assessment" },
  { from: "SELF_ASSESSED", to: "APPRAISED", by: "appraiser", label: "Record the appraisal" },
  // The appraiser may write before the appraisee has: somebody who never
  // submits cannot thereby prevent being appraised, which would be a way of
  // avoiding one for ever.
  { from: "DRAFT", to: "APPRAISED", by: "appraiser", label: "Appraise without a self-assessment" },
  { from: "APPRAISED", to: "AGREED", by: "appraisee", label: "I agree with this" },
  { from: "APPRAISED", to: "DISPUTED", by: "appraisee", label: "I do not agree" },
  // Back for another conversation. The dispute and its wording stay on the
  // record; what changes is that somebody is talking again.
  { from: "DISPUTED", to: "APPRAISED", by: "appraiser", label: "Revise after the meeting" },
];

export function allowedTransitions(from: string, roles: Role[]): typeof TRANSITIONS {
  return TRANSITIONS.filter(
    (transition) => transition.from === from && roles.includes(transition.by),
  );
}

export function canTransition(from: string, to: string, roles: Role[]): boolean {
  return allowedTransitions(from, roles).some((transition) => transition.to === to);
}

/** Whether the appraisee may still edit their own half. */
export function selfEditable(status: string): boolean {
  return status === "DRAFT";
}

/** Whether the appraiser may still edit theirs. */
export function appraiserEditable(status: string): boolean {
  return status === "DRAFT" || status === "SELF_ASSESSED" || status === "DISPUTED";
}

/** Whether the thing is finished either way. */
export function settled(status: string): boolean {
  return status === "AGREED" || status === "DISPUTED";
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export type Target = { description: string; reviewBy?: Date | null; met?: boolean | null };

export function targetProblem(target: Target): string | null {
  const description = target.description.trim();
  if (!description) return "Say what the target is.";
  if (description.length < 8) {
    return "A target somebody could not act on is not a target. Say what is to be different.";
  }
  if (description.length > 500) return "Shorter. A target is a sentence, not a report.";
  return null;
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export type Decision = {
  from: string;
  to: string;
  roles: Role[];
  /** Whether the person acting is the person being appraised. */
  own: boolean;
  /** The appraiser is the same person as the appraisee. Should never happen. */
  selfAppraisal: boolean;
  scores: Score[];
  targets: Target[];
  /** The comment typed into the box for this step, if any. */
  note: string;
};

/**
 * Why this cannot be done, or null.
 *
 * The first two are the ones that make the document worth anything. Nobody
 * appraises themselves, and nobody is recorded as agreeing to an appraisal
 * except the person it is about: an appraiser who could tick "agreed" on
 * somebody's behalf has produced a document with one signature and two names.
 */
export function refusal(decision: Decision): string | null {
  const { from, to, roles, own, selfAppraisal, scores, targets, note } = decision;

  if (selfAppraisal) {
    return "An appraisal cannot have the same person on both sides of it. Whoever manages staff sets the appraiser.";
  }

  if (!canTransition(from, to, roles)) {
    if ((to === "AGREED" || to === "DISPUTED") && !own) {
      return "Only the person being appraised can agree to it or disagree with it. That is the whole of what the signature means.";
    }
    return `Something that is ${statusLabel(from).toLowerCase()} cannot become ${statusLabel(to).toLowerCase()}.`;
  }

  if (to === "APPRAISED") {
    const missing = unrated(scores);
    if (missing.length > 0) {
      return `Rate every heading first. Still to do: ${missing.join(", ")}.`;
    }
    if (!note.trim()) {
      return "Write the appraisal. A set of ratings with nothing said about them is not something anybody can act on.";
    }
    if (targets.length === 0) {
      return "Set at least one target. An appraisal that asks for nothing to change is a form, not a conversation.";
    }
    const bad = targets.map(targetProblem).find(Boolean);
    if (bad) return bad;
  }

  if (to === "DISPUTED" && !note.trim()) {
    return "Say what you disagree with. Your words go on the record beside the appraisal, which is the point of being able to disagree at all.";
  }

  return null;
}
