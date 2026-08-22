import "server-only";

import { assessmentAverage, stageOf, type Stage } from "./admission-rules";
import { db } from "./db";

/**
 * The intake, seen whole.
 *
 * The one query behind the board. Everything the board shows is derived from
 * it — the stage, the entrance average, the latest recommendation — because a
 * second query answering any of those separately is a second answer.
 */

export type PipelineRow = {
  id: string;
  studentId: string;
  name: string;
  admissionNo: string;
  levelName: string | null;
  levelId: string | null;
  source: string;
  siblingName: string | null;
  appliedOn: Date;
  feePaid: boolean;
  feeMinor: number;
  papers: Array<{ paper: string; score: number | null; maxScore: number }>;
  average: number | null;
  recommendation: string | null;
  /** What the interviewer wrote. It was stored and read back nowhere. */
  interviewNote: string | null;
  interviewAttendees: string | null;
  interviewedOn: Date | null;
  offeredOn: Date | null;
  offerExpiresOn: Date | null;
  waitlistRank: number | null;
  stage: Stage;
  notes: string | null;
};

export async function pipeline(academicYearId: string, now: Date): Promise<PipelineRow[]> {
  const applications = await db.admissionApplication.findMany({
    where: { academicYearId },
    orderBy: [{ waitlistRank: "asc" }, { appliedOn: "asc" }],
    take: 2000,
    select: {
      id: true,
      studentId: true,
      source: true,
      appliedOn: true,
      applicationFeeMinor: true,
      applicationFeePaid: true,
      offeredOn: true,
      offerExpiresOn: true,
      acceptedOn: true,
      declinedOn: true,
      waitlistRank: true,
      notes: true,
      applyingForLevel: { select: { id: true, name: true } },
      sibling: { select: { firstName: true, lastName: true } },
      student: {
        select: {
          status: true,
          firstName: true,
          lastName: true,
          otherNames: true,
          admissionNo: true,
        },
      },
      assessments: {
        orderBy: { paper: "asc" },
        select: { paper: true, score: true, maxScore: true },
      },
      interviews: {
        orderBy: { heldOn: "desc" },
        select: { decision: true, heldOn: true, notes: true, attendees: true },
      },
    },
  });

  return applications.map((application) => {
    const papers = application.assessments.map((entry) => ({
      paper: entry.paper,
      score: entry.score === null ? null : Number(entry.score),
      maxScore: Number(entry.maxScore),
    }));

    return {
      id: application.id,
      studentId: application.studentId,
      name: [
        application.student.firstName,
        application.student.otherNames,
        application.student.lastName,
      ]
        .filter(Boolean)
        .join(" "),
      admissionNo: application.student.admissionNo,
      levelName: application.applyingForLevel?.name ?? null,
      levelId: application.applyingForLevel?.id ?? null,
      source: application.source,
      siblingName: application.sibling
        ? `${application.sibling.firstName} ${application.sibling.lastName}`
        : null,
      appliedOn: application.appliedOn,
      feePaid: application.applicationFeePaid,
      feeMinor: application.applicationFeeMinor,
      papers,
      average: assessmentAverage(papers),
      // The most recent one. A family seen twice is two records, and the
      // second conversation is the one that stands.
      recommendation: application.interviews[0]?.decision ?? null,
      interviewNote: application.interviews[0]?.notes ?? null,
      interviewAttendees: application.interviews[0]?.attendees ?? null,
      interviewedOn: application.interviews[0]?.heldOn ?? null,
      offeredOn: application.offeredOn,
      offerExpiresOn: application.offerExpiresOn,
      waitlistRank: application.waitlistRank,
      stage: stageOf(
        {
          studentStatus: application.student.status,
          assessments: papers,
          interviews: application.interviews.map((entry) => ({ decision: entry.decision })),
          offeredOn: application.offeredOn,
          offerExpiresOn: application.offerExpiresOn,
          acceptedOn: application.acceptedOn,
          declinedOn: application.declinedOn,
          waitlistRank: application.waitlistRank,
        },
        now,
      ),
      notes: application.notes,
    };
  });
}

/**
 * Places: how many seats a year group has, and how many are spoken for.
 *
 * Seats come from the sections' capacities, which is the only number in the
 * system that means "how many children fit". Spoken for counts the children
 * already enrolled plus every outstanding offer — including the lapsed ones,
 * because nothing releases a lapsed offer automatically and a school that
 * counted the seat as free would offer it twice.
 */
export async function placesByLevel(academicYearId: string, now: Date) {
  const [levels, rows] = await Promise.all([
    db.classLevel.findMany({
      orderBy: { sequence: "asc" },
      select: {
        id: true,
        name: true,
        sections: {
          select: {
            capacity: true,
            _count: {
              select: { enrollments: { where: { status: "ACTIVE", academicYearId } } },
            },
          },
        },
      },
    }),
    pipeline(academicYearId, now),
  ]);

  // Offers held against no year group. They are real seats promised to real
  // families, and belonging to no level they fell out of every count — a
  // school could promise ten places the board never mentioned.
  const unplaced = rows.filter(
    (row) =>
      row.levelId === null &&
      (row.stage === "OFFERED" || row.stage === "EXPIRED" || row.stage === "ACCEPTED"),
  ).length;

  const byLevel = levels.map((level) => {
    const seats = level.sections.reduce((sum, section) => sum + section.capacity, 0);
    const enrolled = level.sections.reduce(
      (sum, section) => sum + section._count.enrollments,
      0,
    );
    const held = rows.filter(
      (row) =>
        row.levelId === level.id &&
        (row.stage === "OFFERED" || row.stage === "EXPIRED" || row.stage === "ACCEPTED"),
    ).length;

    return {
      id: level.id,
      name: level.name,
      seats,
      enrolled,
      held,
      free: Math.max(0, seats - enrolled - held),
      over: enrolled + held > seats,
    };
  });

  return { levels: byLevel, unplaced };
}
