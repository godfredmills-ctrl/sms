import "server-only";

import { db } from "./db";

/**
 * A candidate's own examinations, for the portals.
 *
 * Scoped on the student id and nothing else. No examination permission is
 * consulted here and none should be: exam.read is a staff permission covering
 * the whole school, and a pupil reaching their own timetable through it would
 * be reaching everyone's. A guardian's page passes the ids from wardIdsFor,
 * which is the same discipline one level out.
 *
 * Only published sittings. A timetable still being built is a draft the exams
 * office is moving papers around in, and a candidate who revises for the draft
 * version sits the wrong paper on the wrong morning.
 */
export type PortalExamPaper = {
  paperId: string;
  subject: string;
  title: string | null;
  startsAt: Date;
  durationMins: number;
  materials: string | null;
  hall: string | null;
  seatNo: string | null;
  /** Set once the register has been marked. */
  attended: "PRESENT" | "ABSENT" | null;
};

export type PortalExamEntry = {
  sessionId: string;
  sessionName: string;
  startsOn: Date;
  endsOn: Date;
  instructions: string | null;
  candidateNo: string;
  studentId: string;
  studentName: string;
  papers: PortalExamPaper[];
};

export async function examsForStudents(
  studentIds: string[],
): Promise<PortalExamEntry[]> {
  if (studentIds.length === 0) return [];

  const candidates = await db.examCandidate.findMany({
    where: { studentId: { in: studentIds }, session: { status: "PUBLISHED" } },
    orderBy: { session: { startsOn: "desc" } },
    select: {
      candidateNo: true,
      studentId: true,
      student: { select: { firstName: true, lastName: true, otherNames: true } },
      session: {
        select: {
          id: true,
          name: true,
          startsOn: true,
          endsOn: true,
          instructions: true,
        },
      },
      seats: {
        select: {
          seatNo: true,
          status: true,
          venue: { select: { name: true } },
          paper: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              durationMins: true,
              materials: true,
              subject: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return candidates.map((candidate) => ({
    sessionId: candidate.session.id,
    sessionName: candidate.session.name,
    startsOn: candidate.session.startsOn,
    endsOn: candidate.session.endsOn,
    instructions: candidate.session.instructions,
    candidateNo: candidate.candidateNo,
    studentId: candidate.studentId,
    studentName: [
      candidate.student.firstName,
      candidate.student.otherNames,
      candidate.student.lastName,
    ]
      .filter(Boolean)
      .join(" "),
    papers: candidate.seats
      .map((seat) => ({
        paperId: seat.paper.id,
        subject: seat.paper.subject.name,
        title: seat.paper.title,
        startsAt: seat.paper.startsAt,
        durationMins: seat.paper.durationMins,
        materials: seat.paper.materials,
        hall: seat.venue?.name ?? null,
        seatNo: seat.seatNo,
        // "Expected" is the state before the hall opens, and telling a pupil
        // they are "expected" for a paper they sat last week reads as though
        // something is outstanding. It shows as nothing until it is marked.
        attended:
          seat.status === "PRESENT" || seat.status === "ABSENT" ? seat.status : null,
      }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  }));
}
