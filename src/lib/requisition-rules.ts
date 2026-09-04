/**
 * Requisitions: asking for something before it is bought.
 *
 * The expenditure module records what the school spent. That is the back half
 * of the job and it arrives too late to change anything: by the time there is
 * a bill, somebody has already promised a supplier money. A bursar asked what
 * is left on the science budget got an answer that counted only what has been
 * invoiced, while four approved requests sat in a drawer waiting to be bought.
 * The figure was correct and it was not the answer to the question.
 *
 * So this module exists to hold the front half, and to produce one number the
 * system could not produce before: what is committed. A budget line has three
 * figures against it, not two.
 *
 *   spent      bills the school has approved or paid
 *   committed  requisitions approved and not yet met
 *   remaining  the budget less both
 *
 * Pure and client-safe, like every rules module here. The screen that shows a
 * bursar what approving something would do to the line, and the action that
 * writes the approval, must agree to the penny, or the warning is decoration.
 */

// ---------------------------------------------------------------------------
// What is being asked for
// ---------------------------------------------------------------------------

/**
 * The columns the money arithmetic needs, and no more.
 *
 * Narrower than Line on purpose. A budget position is asked for across every
 * approved requisition in a category, and requiring a description there would
 * have every one of those queries read a column it never uses, for no reason
 * beyond a type wanting it.
 */
export type Costed = {
  quantity: number;
  /** What one costs, in minor units. An estimate, and named as one. */
  estimatedUnitMinor: number;
  /** How many have actually been issued from the store or bought. */
  fulfilledQty?: number;
};

export type Line = Costed & {
  /** What it is, in the words the person asking would use. */
  description: string;
};

/** What one line is expected to cost. */
export function lineTotal(line: Costed): number {
  return Math.max(0, Math.round(line.quantity * line.estimatedUnitMinor));
}

/** What the whole request is expected to cost. */
export function estimateTotal(lines: Costed[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

/**
 * What is still outstanding on a request, at the estimate.
 *
 * This is the figure that stays committed against the budget. Half a delivery
 * releases half the commitment, which is the point of tracking quantities per
 * line rather than a single tick on the request.
 */
export function outstandingTotal(lines: Costed[]): number {
  return lines.reduce((sum, line) => {
    const left = Math.max(0, line.quantity - (line.fulfilledQty ?? 0));
    return sum + Math.max(0, Math.round(left * line.estimatedUnitMinor));
  }, 0);
}

export type Fulfilment = "none" | "partial" | "full";

/** How much of a request has actually arrived. */
export function fulfilment(lines: Costed[]): Fulfilment {
  if (lines.length === 0) return "none";

  const wanted = lines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
  const got = lines.reduce(
    (sum, line) => sum + Math.min(Math.max(0, line.fulfilledQty ?? 0), Math.max(0, line.quantity)),
    0,
  );

  if (got <= 0) return "none";
  return got >= wanted ? "full" : "partial";
}

/**
 * What is wrong with a line, or null.
 *
 * Quantities and prices are typed by somebody in a hurry, and every one of
 * these has a way of arriving as a request nobody can act on: no description,
 * so the storekeeper does not know what to issue; a quantity of zero, so the
 * request costs nothing and is approved without thought; a price with the
 * pesewas in the wrong place, so the budget warning never fires.
 */
export function lineProblem(line: Line): string | null {
  if (!line.description.trim()) return "Say what it is.";
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    return "How many? A request for none of something is not a request.";
  }
  if (!Number.isInteger(line.quantity)) return "Whole units only.";
  if (line.quantity > 100_000) return "That is more than a school orders. Check the figure.";
  if (!Number.isFinite(line.estimatedUnitMinor) || line.estimatedUnitMinor < 0) {
    return "What does one cost? An estimate is fine; a blank is not.";
  }
  if (line.estimatedUnitMinor > 100_000_000) {
    return "That is over a million cedis each. Check where the pesewas are.";
  }
  const fulfilled = line.fulfilledQty ?? 0;
  if (fulfilled < 0) return "Received cannot be negative.";
  if (fulfilled > line.quantity) {
    return "More received than were asked for. Raise the quantity, or record the rest separately.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// The budget it draws on
// ---------------------------------------------------------------------------

export type BudgetPosition = {
  /** The figure agreed for the year. Null when nobody set one. */
  budgetMinor: number | null;
  /** Bills approved or paid against the category this year. */
  spentMinor: number;
  /** Approved requisitions not yet met, at their estimate. */
  committedMinor: number;
};

export type Verdict = {
  /** Budget less spent less already committed. Null when there is no budget. */
  remainingMinor: number | null;
  /** What would be left if this request were approved. */
  wouldRemainMinor: number | null;
  /** How far past the budget this request would take the line. */
  overByMinor: number;
  /** True when approving it needs somebody to say why. */
  overBudget: boolean;
  /** True when there is no budget line at all: not over, just unmeasured. */
  unbudgeted: boolean;
  /** What proportion of the budget is used, after this. 0 when unbudgeted. */
  usedRatio: number;
};

/**
 * What approving this request would do to its budget line.
 *
 * Being over budget is not forbidden. Schools overspend, a generator fails in
 * October, and software that refuses would simply be worked around by not
 * raising the requisition at all, which loses the record as well as the
 * control. What it must not be is silent: over budget is a decision that
 * carries a name and a reason, and the whole apparatus exists so that in April
 * somebody can ask who decided and be answered.
 *
 * No budget set is its own case and deliberately not treated as a budget of
 * zero. A category nobody has budgeted is unmeasured, and reporting every
 * request against it as an overspend teaches people the warning means nothing.
 */
export function verdictFor(position: BudgetPosition, requestMinor: number): Verdict {
  const { budgetMinor, spentMinor, committedMinor } = position;

  if (budgetMinor === null) {
    return {
      remainingMinor: null,
      wouldRemainMinor: null,
      overByMinor: 0,
      overBudget: false,
      unbudgeted: true,
      usedRatio: 0,
    };
  }

  const remaining = budgetMinor - spentMinor - committedMinor;
  const wouldRemain = remaining - requestMinor;

  return {
    remainingMinor: remaining,
    wouldRemainMinor: wouldRemain,
    overByMinor: wouldRemain < 0 ? -wouldRemain : 0,
    overBudget: wouldRemain < 0,
    unbudgeted: false,
    usedRatio:
      budgetMinor > 0
        ? Math.min(2, (spentMinor + committedMinor + requestMinor) / budgetMinor)
        : requestMinor > 0
          ? 2
          : 0,
  };
}

/** How a budget line should read on a screen. */
export function budgetTone(verdict: Verdict): "success" | "warning" | "danger" | "neutral" {
  if (verdict.unbudgeted) return "neutral";
  if (verdict.overBudget) return "danger";
  if (verdict.usedRatio >= 0.9) return "warning";
  return "success";
}

// ---------------------------------------------------------------------------
// Where a request has got to
// ---------------------------------------------------------------------------

export const STATUSES = [
  { value: "DRAFT", label: "Draft", tone: "neutral", hint: "Only you can see it." },
  {
    value: "SUBMITTED",
    label: "Waiting for approval",
    tone: "warning",
    hint: "With whoever approves. It cannot be edited while it is there.",
  },
  {
    value: "APPROVED",
    label: "Approved",
    tone: "success",
    hint: "Committed against the budget until it is met.",
  },
  {
    value: "REJECTED",
    label: "Turned down",
    tone: "danger",
    hint: "With a reason. It can be edited and sent again.",
  },
  {
    value: "FULFILLED",
    label: "Met",
    tone: "success",
    hint: "Issued from the store or bought. No longer committed.",
  },
  {
    value: "CANCELLED",
    label: "Cancelled",
    tone: "neutral",
    hint: "Withdrawn. Kept so the reference is not reused.",
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

/**
 * What may follow what, and who may do it.
 *
 * A table rather than a scatter of ifs, because the screen draws buttons from
 * it and the action refuses from it. The two disagreeing is how a button
 * appears that does nothing, which this codebase has fixed more than once.
 */
export const TRANSITIONS: Array<{
  from: Status;
  to: Status;
  by: "requester" | "approver" | "storekeeper";
  label: string;
}> = [
  { from: "DRAFT", to: "SUBMITTED", by: "requester", label: "Send for approval" },
  { from: "DRAFT", to: "CANCELLED", by: "requester", label: "Cancel" },
  { from: "SUBMITTED", to: "APPROVED", by: "approver", label: "Approve" },
  { from: "SUBMITTED", to: "REJECTED", by: "approver", label: "Turn down" },
  { from: "SUBMITTED", to: "CANCELLED", by: "requester", label: "Withdraw" },
  { from: "REJECTED", to: "DRAFT", by: "requester", label: "Reopen and edit" },
  { from: "APPROVED", to: "FULFILLED", by: "storekeeper", label: "Mark as met" },
  { from: "APPROVED", to: "CANCELLED", by: "approver", label: "Cancel" },
];

export type Role = "requester" | "approver" | "storekeeper";

export function allowedTransitions(from: string, roles: Role[]): typeof TRANSITIONS {
  return TRANSITIONS.filter(
    (transition) => transition.from === from && roles.includes(transition.by),
  );
}

export function canTransition(from: string, to: string, roles: Role[]): boolean {
  return allowedTransitions(from, roles).some((transition) => transition.to === to);
}

/** A request in a state where its lines may still be changed. */
export function editable(status: string): boolean {
  return status === "DRAFT";
}

/** A request whose estimate is committed against the budget. */
export function committed(status: string): boolean {
  return status === "APPROVED";
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export type Decision = {
  from: string;
  to: string;
  roles: Role[];
  /** Whether the person deciding is the person who asked. */
  own: boolean;
  /** The reason typed into the box, if any. */
  note: string;
  lines: Line[];
  verdict: Verdict;
};

/**
 * Why this cannot be done, or null.
 *
 * The one that matters is the first. Everything else here is arithmetic or a
 * missing sentence; that one is the reason a school has a requisition process
 * rather than a petty cash tin.
 */
export function refusal(decision: Decision): string | null {
  const { from, to, roles, own, note, lines, verdict } = decision;

  if (!canTransition(from, to, roles)) {
    return `Something that is ${statusLabel(from).toLowerCase()} cannot become ${statusLabel(to).toLowerCase()}.`;
  }

  if (to === "APPROVED" || to === "REJECTED") {
    if (own) {
      return "You cannot decide your own requisition. Somebody else has to, which is the whole of what a requisition is for.";
    }
  }

  if (to === "SUBMITTED") {
    if (lines.length === 0) {
      return "Add what you are asking for before sending it.";
    }
    const bad = lines.map(lineProblem).find(Boolean);
    if (bad) return bad;
  }

  if (to === "REJECTED" && !note.trim()) {
    return "Say why it is being turned down. Somebody has to know what to change.";
  }

  if (to === "APPROVED" && verdict.overBudget && !note.trim()) {
    return "This takes the line over its budget. Approving it is allowed; doing it silently is not, so say why.";
  }

  return null;
}

// A reference generator deliberately does NOT live here. Every document in
// this system is numbered by nextDocumentNumber in lib/finance.ts, which gives
// REQ-2026-00007, and a second format invented in this file would have put two
// numbering schemes in one filing cabinet.
