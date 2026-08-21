import "server-only";

import { db } from "./db";
import { offeringsForPaper } from "./exam-marks";

/**
 * Running an examination.
 *
 * Two things here are worth more than the rest of the module: finding the
 * clashes before the timetable goes out, and seating candidates so that
 * neighbours cannot read each other's papers. Both are the sort of thing a
 * person does with a printout and a pencil at eleven at night, and gets wrong.
 *
 * The marks live elsewhere — Assessment, and the gradebook. This is the
 * sitting: who, where, when, watched by whom, and who did not come.
 */

// -----------------------------------------------------------------------------
// Whose hall is it
// -----------------------------------------------------------------------------

/**
 * Whether this person is watching this paper.
 *
 * The one definition, used by the page that decides whether to show the hall
 * register and by the action that writes to it — a page and an action
 * disagreeing about who may do something is how a screen offers what the
 * server then refuses, or worse, does not.
 *
 * It matters because exam.attendance is a teacher's permission. Taken to mean
 * "any hall", it hands every teacher the name, class and index number of every
 * candidate in the school — the same permission that is carefully scoped to
 * own-classes everywhere else in this system. A teacher invigilating Thursday
 * morning gets Thursday morning's hall.
 */
export async function invigilates(
  staffId: string | null | undefined,
  paperId: string,
): Promise<boolean> {
  if (!staffId) return false;
  const watching = await db.examInvigilator.findUnique({
    where: { paperId_staffId: { paperId, staffId } },
    select: { id: true },
  });
  return Boolean(watching);
}

// -----------------------------------------------------------------------------
// Who sits a paper
// -----------------------------------------------------------------------------

/**
 * The candidates for a paper.
 *
 * A paper is a subject for a year group, and a year group is several sections.
 * Which of them actually takes the subject is answered by the offerings: a
 * section with an active offering for that subject is a section that is taught
 * it, and everyone enrolled in that section sits it. That is how the rest of
 * this system models subject-taking, so the examination follows it rather than
 * inventing a second answer — the two disagreeing would mean a candidate with
 * marks in a subject nobody sat them for.
 */
export async function candidatesForPaper(paperId: string) {
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { sessionId: true },
  });
  if (!paper) return [];

  // Through offeringsForPaper, which is the one answer to "which classes sit
  // this paper". The query used to be written out here as well, selecting only
  // the section ids and discarding the offerings — and the marking sheet needs
  // those offerings, so a second copy would have been the version that drifted.
  const offerings = await offeringsForPaper(paperId);
  const sectionIds = [...new Set(offerings.map((offering) => offering.classSectionId))];
  if (sectionIds.length === 0) return [];

  return db.examCandidate.findMany({
    where: { sessionId: paper.sessionId, classSectionId: { in: sectionIds } },
    orderBy: [{ classSectionId: "asc" }, { candidateNo: "asc" }],
    select: {
      id: true,
      candidateNo: true,
      classSectionId: true,
      student: { select: { id: true, firstName: true, lastName: true, otherNames: true } },
    },
  });
}

// -----------------------------------------------------------------------------
// Seating
// -----------------------------------------------------------------------------

export type SeatPlan = {
  candidateId: string;
  venueId: string;
  seatNo: string;
};

export type Hall = { id: string; name: string; capacity: number };

/**
 * Seats candidates so that neighbours are not classmates.
 *
 * A hall's seats are numbered in the order the desks stand — left to right,
 * front to back — so consecutive seat numbers are, physically, next to each
 * other. Seating a hall by class puts thirty pupils who have sat through the
 * same lessons in one unbroken block, which is the arrangement a school is
 * trying to avoid.
 *
 * So the sections are dealt out in rotation, one candidate at a time, like
 * cards: 3A, 3B, 3C, 3A, 3B, 3C. Two adjacent seats hold the same section only
 * once the other sections have run out, and the run of classmates at the end
 * is as short as the arithmetic allows.
 *
 * Halls are filled in the order given, each to its capacity. The seat number
 * carries the hall's letter — "A-014" — because the paper's uniqueness
 * constraint is on the number alone, and two halls both starting at 1 would be
 * two candidates the database believes are in one seat.
 */
export function planSeats(
  candidates: Array<{ id: string; classSectionId: string | null }>,
  halls: Hall[],
): { plan: SeatPlan[]; unseated: number } {
  if (halls.length === 0) return { plan: [], unseated: candidates.length };

  // Grouped by section, each group keeping the order it arrived in — which is
  // by index number, so the dealing is repeatable rather than arbitrary.
  const groups = new Map<string, Array<{ id: string }>>();
  for (const candidate of candidates) {
    const key = candidate.classSectionId ?? "unplaced";
    const group = groups.get(key);
    if (group) group.push({ id: candidate.id });
    else groups.set(key, [{ id: candidate.id }]);
  }

  // Largest section first, so the section that will inevitably run on at the
  // end is dealt from throughout rather than left in one block.
  const decks = [...groups.values()].sort((a, b) => b.length - a.length);

  const dealt: string[] = [];
  let index = 0;
  while (dealt.length < candidates.length) {
    let placedThisRound = false;
    for (const deck of decks) {
      const next = deck[index];
      if (!next) continue;
      dealt.push(next.id);
      placedThisRound = true;
    }
    index += 1;
    // Cannot happen while the decks hold anybody, but a loop that fills a hall
    // is not a loop to leave without a floor under it.
    if (!placedThisRound) break;
  }

  const plan: SeatPlan[] = [];
  const letters = hallLetters(halls);
  let at = 0;

  for (const hall of halls) {
    // The prefix from hallLetters, not the hall's first letter: "Assembly
    // Hall" and "Art Room" both start with A, and two halls numbering from
    // A-001 would collide on the paper's unique seat number — the allocation
    // would fail halfway through, having already seated half the year group.
    const letter = letters.get(hall.id) ?? "H";
    for (let seat = 1; seat <= hall.capacity && at < dealt.length; seat += 1) {
      plan.push({
        candidateId: dealt[at],
        venueId: hall.id,
        seatNo: `${letter}-${String(seat).padStart(3, "0")}`,
      });
      at += 1;
    }
  }

  return { plan, unseated: dealt.length - at };
}

/**
 * A short prefix for a hall, distinct within the halls given.
 *
 * "Assembly Hall" and "Art Room" both begin with A, and two halls sharing a
 * prefix defeats the point of having one — so it falls back to more of the
 * name rather than to a letter that is not unique.
 */
export function hallLetters(halls: Hall[]): Map<string, string> {
  const used = new Set<string>();
  const letters = new Map<string, string>();

  for (const hall of halls) {
    const cleaned = hall.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "H";
    let candidate = cleaned.slice(0, 1);
    let length = 1;
    while (used.has(candidate) && length < cleaned.length) {
      length += 1;
      candidate = cleaned.slice(0, length);
    }
    // Still clashing after using the whole name: two halls named the same,
    // which the unique constraint on the name forbids. A number ends it.
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${cleaned.slice(0, 1)}${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    letters.set(hall.id, candidate);
  }

  return letters;
}

// -----------------------------------------------------------------------------
// Clashes
// -----------------------------------------------------------------------------

export type Clash = {
  kind: "candidate" | "invigilator" | "venue" | "capacity" | "unseated";
  severity: "blocking" | "warning";
  message: string;
  paperIds: string[];
};

export type PaperForClash = {
  id: string;
  title: string | null;
  startsAt: Date;
  durationMins: number;
  subject: { name: string };
  classLevel: { id: string; name: string };
  invigilators: { staffId: string; staff: { firstName: string; lastName: string } }[];
  seats: { venueId: string | null; venue: { name: string; capacity: number } | null }[];
};

function overlaps(a: PaperForClash, b: PaperForClash): boolean {
  const aStart = a.startsAt.getTime();
  const aEnd = aStart + a.durationMins * 60_000;
  const bStart = b.startsAt.getTime();
  const bEnd = bStart + b.durationMins * 60_000;
  // Touching is not overlapping: a paper ending at 10:00 and one starting at
  // 10:00 are back to back, which is a tight morning and not a clash.
  return aStart < bEnd && bStart < aEnd;
}

function label(paper: PaperForClash): string {
  return `${paper.subject.name}${paper.title ? ` ${paper.title}` : ""} (${paper.classLevel.name})`;
}

/**
 * Everything wrong with a timetable, found before it goes out.
 *
 * Each of these is discovered on the morning otherwise, and each has the same
 * shape: two things scheduled into one place. They are separated into blocking
 * and warning because a school will knowingly run a tight timetable, and a
 * warning it can dismiss is worth more than a rule it has to work around.
 */
export async function clashesIn(sessionId: string): Promise<Clash[]> {
  return findClashes(
    (await db.examPaper.findMany({
    where: { sessionId },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      durationMins: true,
      subject: { select: { name: true } },
      classLevel: { select: { id: true, name: true } },
      invigilators: {
        select: { staffId: true, staff: { select: { firstName: true, lastName: true } } },
      },
      seats: {
        select: { venueId: true, venue: { select: { name: true, capacity: true } } },
      },
    },
    })) as PaperForClash[],
  );
}

/**
 * The clash rules themselves, over papers already loaded.
 *
 * Split from the query so they can be tested. Clash detection is the safety
 * net for the whole module — it is what stands between a mistake on a Tuesday
 * and a year group arriving at a hall that is already full on the Thursday —
 * and it was the one part of it that nothing could exercise without a
 * database.
 */
export function findClashes(papers: PaperForClash[]): Clash[] {
  const clashes: Clash[] = [];

  for (let i = 0; i < papers.length; i += 1) {
    for (let j = i + 1; j < papers.length; j += 1) {
      const a = papers[i];
      const b = papers[j];
      if (!overlaps(a, b)) continue;

      // The same year group cannot be in two halls at once.
      if (a.classLevel.id === b.classLevel.id) {
        clashes.push({
          kind: "candidate",
          severity: "blocking",
          message: `${a.classLevel.name} is sitting ${label(a)} and ${label(b)} at the same time.`,
          paperIds: [a.id, b.id],
        });
      }

      // Nor can an invigilator be in two.
      for (const one of a.invigilators) {
        const both = b.invigilators.find((other) => other.staffId === one.staffId);
        if (!both) continue;
        clashes.push({
          kind: "invigilator",
          severity: "blocking",
          message: `${one.staff.firstName} ${one.staff.lastName} is invigilating ${label(a)} and ${label(b)} at the same time.`,
          paperIds: [a.id, b.id],
        });
      }

      // Nor can a hall hold two papers, unless between them they fit — which
      // is a real arrangement, so it is a warning and not a refusal.
      const hallsOf = (paper: PaperForClash) =>
        new Map(
          paper.seats
            .filter((seat) => seat.venueId && seat.venue)
            .map((seat) => [seat.venueId!, seat.venue!] as const),
        );
      const aHalls = hallsOf(a);
      const bHalls = hallsOf(b);

      for (const [venueId, venue] of aHalls) {
        if (!bHalls.has(venueId)) continue;
        const together =
          a.seats.filter((seat) => seat.venueId === venueId).length +
          b.seats.filter((seat) => seat.venueId === venueId).length;
        clashes.push({
          kind: "venue",
          severity: together > venue.capacity ? "blocking" : "warning",
          message:
            together > venue.capacity
              ? `${venue.name} is holding ${together} candidates at once across ${label(a)} and ${label(b)}, and seats ${venue.capacity}.`
              : `${venue.name} is holding ${label(a)} and ${label(b)} at the same time — ${together} candidates in ${venue.capacity} seats.`,
          paperIds: [a.id, b.id],
        });
      }
    }
  }

  return clashes;
}

// -----------------------------------------------------------------------------
// Index numbers
// -----------------------------------------------------------------------------

/**
 * The next index number in a session.
 *
 * Sequential within the session and padded, because these are read off scripts
 * by hand and written into a mark sheet. The unique constraint on
 * (session, number) is what actually guarantees it; this only has to be right
 * most of the time.
 */
export async function nextCandidateNo(sessionId: string, prefix: string): Promise<string> {
  const last = await db.examCandidate.findFirst({
    where: { sessionId, candidateNo: { startsWith: `${prefix}-` } },
    orderBy: { candidateNo: "desc" },
    select: { candidateNo: true },
  });

  const previous = last ? Number.parseInt(last.candidateNo.split("-").pop() ?? "", 10) : 0;
  const next = Number.isFinite(previous) ? previous + 1 : 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

/** How a session's index numbers are prefixed — the year, short. */
export function candidatePrefix(startsOn: Date): string {
  return String(startsOn.getFullYear());
}
