import type { Tone } from "@/components/ui";

/**
 * Where an applicant stands, and what the school may do next.
 *
 * Pure and client-safe: the board that draws the buttons and the actions that
 * carry them out both read this, and a page and an action disagreeing about
 * what is allowed is how a button appears that always fails.
 *
 * The stage is **derived**, never stored. A stored stage is a second copy of
 * facts that already exist — a score, an interview, an offer date, an
 * acceptance — and it is the copy that goes stale when somebody corrects one
 * of them.
 */

export type ApplicationFacts = {
  /** Student.status: APPLICANT, OFFERED, ENROLLED, WITHDRAWN… */
  studentStatus: string;
  assessments: Array<{ score: number | null }>;
  interviews: Array<{ decision: string }>;
  offeredOn: Date | string | null;
  offerExpiresOn: Date | string | null;
  acceptedOn: Date | string | null;
  declinedOn: Date | string | null;
  waitlistRank: number | null;
};

export type Stage =
  | "APPLIED"
  | "ASSESSED"
  | "INTERVIEWED"
  | "WAITLISTED"
  | "OFFERED"
  | "EXPIRED"
  | "ACCEPTED"
  | "DECLINED"
  | "ENROLLED"
  | "WITHDRAWN";

export const STAGES: Array<{
  value: Stage;
  label: string;
  tone: Tone;
  description: string;
}> = [
  { value: "APPLIED", label: "Applied", tone: "neutral", description: "In, and nothing done yet." },
  { value: "ASSESSED", label: "Assessed", tone: "info", description: "Entrance papers marked." },
  { value: "INTERVIEWED", label: "Interviewed", tone: "info", description: "The family has been seen." },
  { value: "WAITLISTED", label: "Waiting list", tone: "warning", description: "Good enough; the year is full." },
  { value: "OFFERED", label: "Offered", tone: "primary", description: "A place is held for them." },
  { value: "EXPIRED", label: "Offer lapsed", tone: "danger", description: "Nobody answered. The place is still being held." },
  { value: "ACCEPTED", label: "Accepted", tone: "success", description: "They are coming. Enrol them." },
  { value: "DECLINED", label: "Declined", tone: "neutral", description: "They went elsewhere." },
  { value: "ENROLLED", label: "Enrolled", tone: "success", description: "On the roll." },
  { value: "WITHDRAWN", label: "Withdrawn", tone: "neutral", description: "Taken out before starting." },
];

function asDate(value: Date | string | null): Date | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The one place that answers "where is this application".
 *
 * Order matters, and it runs from the most settled outcome backwards. A child
 * who has been enrolled is enrolled whatever else is on the record; a lapsed
 * offer is reported ahead of the interview that produced it, because the
 * lapsed offer is the thing somebody has to act on.
 */
export function stageOf(facts: ApplicationFacts, now: Date): Stage {
  if (facts.studentStatus === "ENROLLED") return "ENROLLED";
  if (facts.studentStatus === "WITHDRAWN" || facts.studentStatus === "TRANSFERRED_OUT") {
    return "WITHDRAWN";
  }

  if (facts.declinedOn) return "DECLINED";
  if (facts.acceptedOn) return "ACCEPTED";

  if (facts.offeredOn) {
    const expires = asDate(facts.offerExpiresOn);
    // An offer with no date on it never lapses, which is the point of asking
    // for one. Where there is a date, the place is still being held after it —
    // nothing releases it automatically, and pretending otherwise would let a
    // school double-count a seat it has not actually got back.
    if (expires && expires.getTime() < now.getTime()) return "EXPIRED";
    return "OFFERED";
  }

  if (facts.waitlistRank !== null) return "WAITLISTED";
  if (facts.interviews.length > 0) return "INTERVIEWED";
  if (facts.assessments.some((entry) => entry.score !== null)) return "ASSESSED";
  return "APPLIED";
}

/** What may be done to an application in this stage. */
export type Act = "ASSESS" | "INTERVIEW" | "WAITLIST" | "OFFER" | "ACCEPT" | "DECLINE" | "ENROL";

export function actsFor(stage: Stage): Act[] {
  switch (stage) {
    case "APPLIED":
    case "ASSESSED":
      return ["ASSESS", "INTERVIEW", "WAITLIST", "OFFER", "DECLINE"];
    case "INTERVIEWED":
      return ["ASSESS", "INTERVIEW", "WAITLIST", "OFFER", "DECLINE"];
    case "WAITLISTED":
      return ["ASSESS", "INTERVIEW", "OFFER", "DECLINE"];
    case "OFFERED":
    case "EXPIRED":
      // An offer can still be accepted after it lapses — that is a decision
      // for the school, and it is the ordinary outcome of ringing the family.
      return ["ACCEPT", "DECLINE", "OFFER"];
    case "ACCEPTED":
      return ["ENROL", "DECLINE"];
    default:
      return [];
  }
}

export function can(stage: Stage, act: Act): boolean {
  return actsFor(stage).includes(act);
}

/**
 * The entrance-paper average, as a percentage.
 *
 * Over the papers actually marked. An unmarked paper is not a zero — the same
 * rule the report card follows, and for the same reason: a child assessed in
 * two subjects out of three is not a child who scored nothing in the third.
 */
export function assessmentAverage(
  papers: Array<{ score: number | null; maxScore: number }>,
): number | null {
  const marked = papers.filter(
    (paper) => paper.score !== null && paper.maxScore > 0,
  );
  if (marked.length === 0) return null;
  const total = marked.reduce(
    (sum, paper) => sum + ((paper.score as number) / paper.maxScore) * 100,
    0,
  );
  return Math.round((total / marked.length) * 10) / 10;
}

export const SOURCES = [
  { value: "WALK_IN", label: "Walked in" },
  { value: "WEBSITE", label: "Website" },
  { value: "REFERRAL", label: "Referral" },
  { value: "AGENT", label: "Agent" },
  { value: "SIBLING", label: "Sibling here" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "OTHER", label: "Other" },
] as const;

export const DECISIONS = [
  { value: "RECOMMEND", label: "Recommend", tone: "success" },
  { value: "RESERVE", label: "Hold in reserve", tone: "warning" },
  { value: "DECLINE", label: "Do not offer", tone: "danger" },
] as const satisfies ReadonlyArray<{ value: string; label: string; tone: Tone }>;
