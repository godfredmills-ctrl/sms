/**
 * Lesson notes: which week it is, what a note still needs, and who may do what.
 *
 * Pure, so the teacher's editor can tell them what is missing as they type and
 * the action that accepts a submission can refuse the same thing. A form that
 * says a note is complete and a server that then rejects it is the shape this
 * codebase keeps finding and fixing.
 *
 * The vocabulary is the one on the form teachers already fill in: topic, RPK,
 * TLMs, core competencies, the three phases, evaluation. Renaming any of it
 * would make every teacher translate, and translation is where a required
 * section quietly stops being filled in.
 */

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

/** Midnight local, so a week is counted in days rather than in milliseconds. */
function midnight(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/** ISO day: Monday is 1, Sunday is 7. */
function isoDay(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/** The Monday of the week a date falls in. */
export function mondayOf(date: Date): Date {
  const back = isoDay(date) - 1;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - back);
  return monday;
}

/**
 * Which week of the term a date falls in, counting from 1.
 *
 * Counted from the Monday of the week term starts, not from the start date
 * itself. A term beginning on a Wednesday still has its first week end on the
 * Friday two days later, which is what the school calls week 1 and what the
 * first lesson note is headed by. Counting from the Wednesday would make week
 * 1 run into the following Tuesday and every week after it wrong by three
 * days.
 *
 * Before term is week 1 and after it is the last week: a teacher writing next
 * term's notes in the holidays should get week 1, not zero or a negative.
 */
export function weekOfTerm(
  date: Date,
  term: { startDate: Date; endDate: Date },
): number {
  const from = midnight(mondayOf(term.startDate));
  const to = midnight(mondayOf(date));

  const week = Math.floor((to - from) / (7 * DAY)) + 1;
  return Math.min(Math.max(week, 1), weeksInTerm(term));
}

/** How many weeks the term runs for, counting part weeks at either end. */
export function weeksInTerm(term: { startDate: Date; endDate: Date }): number {
  const from = midnight(mondayOf(term.startDate));
  const to = midnight(mondayOf(term.endDate));
  return Math.max(1, Math.floor((to - from) / (7 * DAY)) + 1);
}

/**
 * The Friday a given week of term ends on.
 *
 * The heading on the printed note, and the date a head teacher sorts the pile
 * by. Friday rather than Sunday because a school week ends on a Friday and
 * that is what the form says.
 */
export function weekEndingFor(
  weekNumber: number,
  term: { startDate: Date },
): Date {
  const monday = mondayOf(term.startDate);
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + (weekNumber - 1) * 7 + 4);
  return friday;
}

/** Every week of the term, for a picker. */
export function termWeeks(term: { startDate: Date; endDate: Date }): Array<{
  weekNumber: number;
  weekEnding: Date;
}> {
  return Array.from({ length: weeksInTerm(term) }, (_, index) => ({
    weekNumber: index + 1,
    weekEnding: weekEndingFor(index + 1, term),
  }));
}

// ---------------------------------------------------------------------------
// What a note needs
// ---------------------------------------------------------------------------

export type NoteFields = {
  topic?: string | null;
  subTopic?: string | null;
  objectives?: string[] | null;
  rpk?: string | null;
  materials?: string[] | null;
  coreCompetencies?: string[] | null;
  introduction?: string | null;
  development?: string | null;
  closure?: string | null;
  evaluation?: string | null;
  homework?: string | null;
  reflection?: string | null;
};

/**
 * The sections of the form, in the order they appear on it.
 *
 * `required` is what a head will send a note back for. Everything else is
 * expected and not enforced: homework is not set every week, and the
 * reflection is written after the teaching rather than before, so requiring
 * either at submission would make the form lie.
 */
export const SECTIONS = [
  { key: "topic", label: "Topic", required: true, kind: "text" },
  { key: "subTopic", label: "Sub-topic", required: false, kind: "text" },
  { key: "objectives", label: "Objectives", required: true, kind: "list" },
  { key: "rpk", label: "Relevant previous knowledge", required: true, kind: "text" },
  { key: "materials", label: "Teaching and learning materials", required: true, kind: "list" },
  { key: "coreCompetencies", label: "Core competencies", required: false, kind: "list" },
  { key: "introduction", label: "Introduction", required: true, kind: "text" },
  { key: "development", label: "Development", required: true, kind: "text" },
  { key: "closure", label: "Closure", required: true, kind: "text" },
  { key: "evaluation", label: "Evaluation", required: true, kind: "text" },
  { key: "homework", label: "Homework", required: false, kind: "text" },
  { key: "reflection", label: "Reflection", required: false, kind: "text" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

function filled(note: NoteFields, key: SectionKey): boolean {
  const value = note[key];
  if (Array.isArray(value)) {
    return value.some((entry) => String(entry ?? "").trim().length > 0);
  }
  return String(value ?? "").trim().length > 0;
}

/** The required sections still empty, named as the form names them. */
export function missingSections(note: NoteFields): string[] {
  return SECTIONS.filter((section) => section.required && !filled(note, section.key)).map(
    (section) => section.label,
  );
}

/** Every section, required or not, that is still empty. */
export function emptySections(note: NoteFields): string[] {
  return SECTIONS.filter((section) => !filled(note, section.key)).map(
    (section) => section.label,
  );
}

/** How much of the form is done, as a fraction, for a progress bar. */
export function completeness(note: NoteFields): number {
  const done = SECTIONS.filter((section) => filled(note, section.key)).length;
  return Math.round((done / SECTIONS.length) * 100);
}

export function readyToSubmit(note: NoteFields): boolean {
  return missingSections(note).length === 0;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type Status = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";

export const STATUSES = [
  {
    value: "DRAFT",
    label: "Draft",
    description: "Being written. Only the teacher sees it.",
    tone: "neutral",
  },
  {
    value: "SUBMITTED",
    label: "Submitted",
    description: "Handed in and waiting to be vetted.",
    tone: "info",
  },
  {
    value: "APPROVED",
    label: "Approved",
    description: "Vetted and signed off. The week may be taught.",
    tone: "success",
  },
  {
    value: "RETURNED",
    label: "Returned",
    description: "Sent back with remarks. Edit it and submit again.",
    tone: "warning",
  },
] as const;

export function statusLabel(value: string): string {
  return STATUSES.find((entry) => entry.value === value)?.label ?? value;
}

export function statusTone(value: string): string {
  return STATUSES.find((entry) => entry.value === value)?.tone ?? "neutral";
}

/**
 * Whether a note can move from one status to another, and who may move it.
 *
 * Written as a table rather than as conditionals in the action, because the
 * screen has to draw the same buttons the action will accept. Two lists of
 * what is allowed is how a button appears that answers 403.
 */
export const TRANSITIONS = [
  { from: "DRAFT", to: "SUBMITTED", by: "teacher", label: "Submit for vetting" },
  { from: "RETURNED", to: "SUBMITTED", by: "teacher", label: "Submit again" },
  { from: "SUBMITTED", to: "APPROVED", by: "vetter", label: "Approve" },
  { from: "SUBMITTED", to: "RETURNED", by: "vetter", label: "Send back" },
  // A head who approved by mistake can put it back in the queue rather than
  // having to send it back to the teacher, who did nothing wrong.
  { from: "APPROVED", to: "SUBMITTED", by: "vetter", label: "Reopen" },
] as const;

export function allowedTransitions(
  from: string,
  role: "teacher" | "vetter",
): Array<{ to: Status; label: string }> {
  return TRANSITIONS.filter(
    (transition) => transition.from === from && transition.by === role,
  ).map((transition) => ({ to: transition.to as Status, label: transition.label }));
}

export function canTransition(from: string, to: string, role: "teacher" | "vetter"): boolean {
  return TRANSITIONS.some(
    (transition) =>
      transition.from === from && transition.to === to && transition.by === role,
  );
}

/**
 * Whether the teacher may still edit the body of the note.
 *
 * Not while it is being vetted, and not once it is approved: a note that can
 * change after it was signed off is a signature on a document that no longer
 * exists. The reflection is the exception and is handled separately, because
 * it is written after the teaching by definition.
 */
export function editable(status: string): boolean {
  return status === "DRAFT" || status === "RETURNED";
}

/** The reflection is written after the week, so it stays open once approved. */
export function reflectionEditable(status: string): boolean {
  return status !== "SUBMITTED";
}

// ---------------------------------------------------------------------------
// Being on time
// ---------------------------------------------------------------------------

export type Timeliness = "early" | "onTime" | "late" | "notSubmitted";

/**
 * Whether a note was in on time.
 *
 * On time means submitted before the Monday the week starts, which is the
 * point of writing it in advance: a note vetted on Wednesday has not been
 * vetted for two days of teaching that already happened.
 *
 * The grace is until the end of that Monday rather than the start of it. A
 * school that insists on Friday afternoon can say so in its own rules; a
 * system that marks a note late at one minute past midnight on Monday is one
 * whose "late" column nobody believes.
 */
export function timeliness(
  note: { status: string; submittedAt: Date | null; weekEnding: Date },
  now: Date,
): Timeliness {
  if (!note.submittedAt || note.status === "DRAFT") {
    return "notSubmitted";
  }

  // The week runs Monday to Friday, and weekEnding is the Friday.
  const monday = new Date(note.weekEnding);
  monday.setDate(monday.getDate() - 4);

  const deadline = midnight(monday) + DAY;
  const submitted = midnight(note.submittedAt) + 1;

  if (submitted <= midnight(monday)) return "early";
  if (submitted <= deadline) return "onTime";

  // `now` is taken rather than read so the same note always reports the same
  // thing, which is what makes a compliance report worth printing.
  void now;
  return "late";
}

export type Compliance = {
  expected: number;
  written: number;
  submitted: number;
  approved: number;
  returned: number;
  missing: number;
  late: number;
};

export type NoteLike = {
  status: string;
  submittedAt: Date | null;
  weekEnding: Date;
};

/**
 * How a teacher, or a whole school, is doing against the weeks so far.
 *
 * `expected` is the weeks that have already happened, not the weeks in the
 * term. Counting a term's worth of weeks in week two produces a compliance
 * figure of eight percent for somebody who is completely up to date, and a
 * number that insults the diligent is a number people stop reading.
 */
export function compliance(
  notes: NoteLike[],
  expectedWeeks: number,
  now: Date,
): Compliance {
  const summary: Compliance = {
    expected: Math.max(0, expectedWeeks),
    written: notes.length,
    submitted: 0,
    approved: 0,
    returned: 0,
    missing: 0,
    late: 0,
  };

  for (const note of notes) {
    if (note.status === "SUBMITTED") summary.submitted += 1;
    if (note.status === "APPROVED") summary.approved += 1;
    if (note.status === "RETURNED") summary.returned += 1;
    if (timeliness(note, now) === "late") summary.late += 1;
  }

  // Only notes that were handed in count towards the weeks covered. A draft
  // sitting in a teacher's own list is not a note the head has seen.
  const handedIn = notes.filter((note) => note.status !== "DRAFT").length;
  summary.missing = Math.max(0, summary.expected - handedIn);

  return summary;
}
