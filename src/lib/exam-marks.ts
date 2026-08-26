import "server-only";

import { db } from "./db";
import { toNumber } from "./utils";

/**
 * The join between a sitting and the marks it produced.
 *
 * A school ran the examination in one place and typed the marks in another,
 * and nothing connected the two. The cost of that was not the double entry —
 * it was that a candidate the invigilator wrote down as absent arrived in the
 * gradebook as a pupil with no mark, which the report card treats as an
 * entirely different thing.
 *
 * The shape: a paper covers a year group, an assessment covers one class. JHS 3
 * Mathematics is one sitting and three columns, owned by up to three different
 * teachers. So the marks are entered once, here, against index numbers in seat
 * order — which is the order the scripts are actually in — and land in whichever
 * section's mark sheet each candidate belongs to.
 */

export type PaperOffering = {
  offeringId: string;
  classSectionId: string;
  sectionName: string;
  termId: string | null;
  teacherId: string | null;
};

/**
 * The subject offerings a paper's marks belong to.
 *
 * This query used to live inside candidatesForPaper, which computed exactly
 * these rows and then threw away everything but the section ids. Two functions
 * answering "which classes sit this paper" is this codebase's recurring bug in
 * its purest form, so there is one, and candidatesForPaper calls it.
 */
export async function offeringsForPaper(paperId: string): Promise<PaperOffering[]> {
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: {
      subjectId: true,
      classLevelId: true,
      session: { select: { termId: true, academicYearId: true } },
    },
  });
  if (!paper) return [];

  const offerings = await db.subjectOffering.findMany({
    where: {
      subjectId: paper.subjectId,
      isActive: true,
      academicYearId: paper.session.academicYearId,
      ...(paper.session.termId ? { termId: paper.session.termId } : {}),
      classSection: { classLevelId: paper.classLevelId },
    },
    orderBy: { classSection: { name: "asc" } },
    select: {
      id: true,
      classSectionId: true,
      termId: true,
      teacherId: true,
      classSection: { select: { name: true } },
    },
  });

  return offerings.map((offering) => ({
    offeringId: offering.id,
    classSectionId: offering.classSectionId,
    sectionName: offering.classSection.name,
    termId: offering.termId,
    teacherId: offering.teacherId,
  }));
}

/**
 * What a paper's generated assessment looks like.
 *
 * Pure, and the only description of it, so generating twice cannot produce two
 * different columns. The session's name is in the title because a term can hold
 * both a mock and an end-of-term sitting, and two columns both called "Paper 1"
 * in one mark sheet is a teacher marking the wrong pile.
 */
export function paperAssessmentSpec(input: {
  paperTitle: string | null;
  sessionName: string;
  maxMarks: number;
  weight: number;
  startsAt: Date;
}) {
  const part = input.paperTitle?.trim();
  return {
    title: `${input.sessionName}${part ? `, ${part}` : ""}`.slice(0, 120),
    category: "EXAM" as const,
    isExam: true,
    maxScore: input.maxMarks,
    weight: input.weight,
    conductedOn: input.startsAt,
    // Never on generation. Publishing notifies every family and cannot be
    // undone from a timetable screen.
    isPublished: false,
  };
}

export type SyncResult =
  | { ok: true; created: number; updated: number; sections: string[] }
  | { ok: false; error: string };

/**
 * Creates or refreshes the mark sheet column for each section sitting a paper.
 *
 * Explicit, not automatic on savePaperAction: papers are created and
 * rescheduled all through timetabling and the weight is not known yet, so
 * teachers would watch columns appear and vanish in their gradebooks.
 */
export async function syncPaperAssessments(paperId: string): Promise<SyncResult> {
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: {
      id: true,
      title: true,
      startsAt: true,
      maxMarks: true,
      weight: true,
      subject: { select: { name: true } },
      session: { select: { name: true, termId: true } },
    },
  });
  if (!paper) return { ok: false, error: "That paper was not found." };

  if (!paper.session.termId) {
    return {
      ok: false,
      error:
        "These examinations are not attached to a term, and a mark has to belong to one. Set the term on the examinations first.",
    };
  }
  if (!paper.maxMarks || paper.maxMarks <= 0) {
    return { ok: false, error: "Set what the paper is marked out of before generating mark sheets." };
  }

  const weight = toNumber(paper.weight);
  if (weight === null || weight <= 0) {
    return {
      ok: false,
      error:
        "Set the paper's weight first: its share of the subject mark. An assessment weighted zero is entered and then ignored by the report card.",
    };
  }

  const offerings = await offeringsForPaper(paperId);
  if (offerings.length === 0) {
    return {
      ok: false,
      error:
        "No class in this year group has this subject on its timetable for this term, so there is nowhere for the marks to go.",
    };
  }

  const termId = paper.session.termId;
  const mismatched = offerings.filter((offering) => offering.termId !== termId);
  if (mismatched.length) {
    return {
      ok: false,
      error: `${mismatched.map((one) => one.sectionName).join(", ")} teach this subject in a different term from these examinations.`,
    };
  }

  const spec = paperAssessmentSpec({
    paperTitle: paper.title,
    sessionName: paper.session.name,
    maxMarks: paper.maxMarks,
    weight,
    startsAt: paper.startsAt,
  });

  // A section's assessment weights must still total 100. Checked before
  // anything is written, and reported by section name, because "the weights
  // do not add up" without saying whose is not actionable.
  const existing = await db.assessment.findMany({
    where: { offeringId: { in: offerings.map((one) => one.offeringId) } },
    select: { id: true, offeringId: true, weight: true, examPaperId: true },
  });

  const over: string[] = [];
  for (const offering of offerings) {
    const others = existing.filter(
      (entry) => entry.offeringId === offering.offeringId && entry.examPaperId !== paperId,
    );
    const used = others.reduce((sum, entry) => sum + (toNumber(entry.weight) ?? 0), 0);
    if (used + weight > 100) {
      over.push(`${offering.sectionName} (${used}% already allocated)`);
    }
  }
  if (over.length) {
    return {
      ok: false,
      error: `Adding ${weight}% would take the weighting past 100% in ${over.join(", ")}.`,
    };
  }

  const before = new Set(
    existing.filter((entry) => entry.examPaperId === paperId).map((entry) => entry.offeringId),
  );

  await db.$transaction(
    offerings.map((offering) =>
      db.assessment.upsert({
        where: {
          examPaperId_offeringId: { examPaperId: paperId, offeringId: offering.offeringId },
        },
        create: { ...spec, offeringId: offering.offeringId, termId, examPaperId: paperId },
        // isPublished and isLocked are deliberately absent from the update: a
        // school that has already published a section's marks must not have
        // them silently withdrawn by somebody pressing generate again.
        update: {
          title: spec.title,
          maxScore: spec.maxScore,
          weight: spec.weight,
          conductedOn: spec.conductedOn,
        },
      }),
    ),
  );

  return {
    ok: true,
    created: offerings.filter((one) => !before.has(one.offeringId)).length,
    updated: offerings.filter((one) => before.has(one.offeringId)).length,
    sections: offerings.map((one) => one.sectionName),
  };
}

// -----------------------------------------------------------------------------
// The marking sheet
// -----------------------------------------------------------------------------

export type ScriptRow = {
  candidateId: string;
  candidateNo: string;
  studentId: string;
  studentName: string;
  seatNo: string | null;
  venueName: string | null;
  seatStatus: "EXPECTED" | "PRESENT" | "ABSENT" | null;
  seatRemark: string | null;
  /** The section they were entered from. */
  enteredSection: string | null;
  /** The section their mark will actually land in — live, not frozen. */
  marksSection: string | null;
  offeringId: string | null;
  assessmentId: string | null;
  score: number | null;
  /** Why this candidate cannot be marked, when they cannot. */
  blockedReason: string | null;
};

/**
 * One row per candidate, in the order the scripts are in.
 *
 * Ordered by seat number by default because that is the pile in the marker's
 * hands: the invigilator collected them row by row. A class register ordered
 * by roll number cannot be walked against it.
 *
 * Nobody is dropped. A candidate with no seat, no live enrolment, or a class
 * that does not sit this subject gets a row with a reason on it — the query
 * this replaced simply never returned them, so a candidate who had somehow
 * ended up outside the pattern was invisible rather than flagged.
 */
export async function paperMarkSheet(paperId: string): Promise<ScriptRow[]> {
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { sessionId: true, session: { select: { academicYearId: true } } },
  });
  if (!paper) return [];

  const offerings = await offeringsForPaper(paperId);
  const offeringBySection = new Map(
    offerings.map((offering) => [offering.classSectionId, offering]),
  );

  const sectionIds = offerings.map((offering) => offering.classSectionId);

  const [candidates, assessments] = await Promise.all([
    db.examCandidate.findMany({
      // The paper's candidates, not the session's. A session runs several year
      // groups over a fortnight, and scoping on the session alone put every
      // candidate in the school on every marking sheet — two hundred rows of
      // which sixty were the pile in front of you and the rest were JHS 1
      // sitting nothing, each with a reason beside it. A list that long is not
      // read; it is scrolled past, and the genuinely blocked candidates it was
      // meant to surface disappear into it.
      //
      // Three ways to belong here, and the union of them is deliberate:
      // somebody who sat it, somebody entered from a class that sits it, and
      // somebody who has since moved into one. The last two are how a
      // candidate ends up needing a row and a reason rather than a mark.
      where: {
        sessionId: paper.sessionId,
        OR: [
          { seats: { some: { paperId } } },
          ...(sectionIds.length
            ? [
                { classSectionId: { in: sectionIds } },
                {
                  student: {
                    enrollments: {
                      some: {
                        status: "ACTIVE" as const,
                        academicYearId: paper.session.academicYearId,
                        classSectionId: { in: sectionIds },
                      },
                    },
                  },
                },
              ]
            : []),
        ],
      },
      orderBy: { candidateNo: "asc" },
      select: {
        id: true,
        candidateNo: true,
        studentId: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            otherNames: true,
            enrollments: {
              where: { status: "ACTIVE", academicYearId: paper.session.academicYearId },
              take: 1,
              select: {
                classSectionId: true,
                classSection: { select: { name: true } },
              },
            },
          },
        },
        classSection: { select: { name: true } },
        seats: {
          where: { paperId },
          take: 1,
          select: {
            seatNo: true,
            status: true,
            remark: true,
            venue: { select: { name: true } },
          },
        },
      },
    }),
    db.assessment.findMany({
      where: { examPaperId: paperId },
      select: {
        id: true,
        offeringId: true,
        scores: { select: { studentId: true, score: true } },
      },
    }),
  ]);

  const assessmentByOffering = new Map(
    assessments.map((assessment) => [assessment.offeringId, assessment]),
  );

  const rows: ScriptRow[] = candidates.map((candidate) => {
    const seat = candidate.seats[0] ?? null;
    // The live enrolment, not the frozen one. The frozen section orders the
    // pile; the mark has to land where the report card will look for it, and
    // report cards are built from who is enrolled now.
    const live = candidate.student.enrollments[0] ?? null;
    const offering = live ? (offeringBySection.get(live.classSectionId) ?? null) : null;
    const assessment = offering
      ? (assessmentByOffering.get(offering.offeringId) ?? null)
      : null;
    const score = assessment
      ? (toNumber(
          assessment.scores.find((entry) => entry.studentId === candidate.studentId)?.score,
        ) ?? null)
      : null;

    let blockedReason: string | null = null;
    if (!live) {
      blockedReason = "No longer on the roll: the mark has no class to land in.";
    } else if (!offering) {
      blockedReason = `${live.classSection.name} does not have this subject on its timetable this term.`;
    } else if (!assessment) {
      blockedReason = "No mark sheet generated for this class yet.";
    } else if (!seat) {
      blockedReason = "Entered but never seated for this paper.";
    }

    return {
      candidateId: candidate.id,
      candidateNo: candidate.candidateNo,
      studentId: candidate.studentId,
      studentName: [
        candidate.student.firstName,
        candidate.student.otherNames,
        candidate.student.lastName,
      ]
        .filter(Boolean)
        .join(" "),
      seatNo: seat?.seatNo ?? null,
      venueName: seat?.venue?.name ?? null,
      seatStatus: seat?.status ?? null,
      seatRemark: seat?.remark ?? null,
      enteredSection: candidate.classSection?.name ?? null,
      marksSection: live?.classSection.name ?? null,
      offeringId: offering?.offeringId ?? null,
      assessmentId: assessment?.id ?? null,
      score,
      blockedReason,
    };
  });

  // Seated first, in seat order — the pile. Everyone else after, so a
  // candidate with a problem is at the foot of the sheet rather than missing.
  return rows.sort((a, b) => {
    if (a.seatNo && b.seatNo) return a.seatNo.localeCompare(b.seatNo);
    if (a.seatNo) return -1;
    if (b.seatNo) return 1;
    return a.candidateNo.localeCompare(b.candidateNo);
  });
}
