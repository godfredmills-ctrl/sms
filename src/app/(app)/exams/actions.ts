"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { paperMarkSheet, syncPaperAssessments } from "@/lib/exam-marks";
import {
  candidatePrefix,
  candidatesForPaper,
  clashesIn,
  invigilates,
  planSeats,
  type Hall,
} from "@/lib/exams";
import { offeringOutOfScope } from "@/lib/scope";

import { publishAssessment } from "../gradebook/actions";

export type ExamState = {
  ok?: boolean;
  error?: string;
  message?: string;
  id?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function number(formData: FormData, key: string, fallback: number): number {
  const parsed = Number.parseInt(text(formData, key), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Saves an examination session — the run as a whole. */
export async function saveSessionAction(
  _previous: ExamState,
  formData: FormData,
): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.exam.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const name = text(formData, "name");
  if (!name) return { error: "Give the examinations a name." };

  const startsOn = new Date(text(formData, "startsOn"));
  const endsOn = new Date(text(formData, "endsOn"));
  if (Number.isNaN(startsOn.getTime())) return { error: "When do they start?" };
  if (Number.isNaN(endsOn.getTime())) return { error: "When do they end?" };
  if (endsOn < startsOn) return { error: "They cannot end before they begin." };

  const termId = text(formData, "termId") || null;
  const term = termId
    ? await db.term.findUnique({
        where: { id: termId },
        select: { academicYearId: true },
      })
    : null;
  if (termId && !term) return { error: "That term was not found." };

  const academicYearId = term?.academicYearId ?? text(formData, "academicYearId");
  if (!academicYearId) return { error: "Which academic year?" };

  const data = {
    name,
    startsOn,
    endsOn,
    termId,
    academicYearId,
    instructions: text(formData, "instructions") || null,
  };

  if (id) {
    await db.examSession.update({ where: { id }, data });
    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: "exam.session.update",
        entity: "ExamSession",
        entityId: id,
        summary: `Edited examinations: ${name}`,
      },
    });
    revalidatePath("/exams");
    revalidatePath(`/exams/${id}`);
    return { ok: true, id, message: "Saved." };
  }

  const created = await db.examSession.create({
    data: { ...data, createdById: user.id },
    select: { id: true },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "exam.session.create",
      entity: "ExamSession",
      entityId: created.id,
      summary: `Set up examinations: ${name}`,
    },
  });

  revalidatePath("/exams");
  redirect(`/exams/${created.id}`);
}

/**
 * Publishes a session, or puts it back into draft.
 *
 * Publishing is what makes the timetable real: it is what candidates and
 * invigilators see. It refuses while a blocking clash stands, because a
 * timetable that puts a year group in two halls at once is not a timetable
 * somebody should be able to circulate by pressing a button.
 */
export async function setSessionStatusAction(formData: FormData): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.exam.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const status = text(formData, "status");
  if (!id) return { error: "Which examinations?" };
  if (!["DRAFT", "PUBLISHED", "COMPLETED"].includes(status)) {
    return { error: "Draft, published or completed." };
  }

  const session = await db.examSession.findUnique({
    where: { id },
    select: { name: true, status: true },
  });
  if (!session) return { error: "Those examinations were not found." };

  if (status === "PUBLISHED") {
    const blocking = (await clashesIn(id)).filter((clash) => clash.severity === "blocking");
    if (blocking.length) {
      return {
        error: `${blocking.length} clash${blocking.length === 1 ? "" : "es"} still to settle. ${blocking[0].message}`,
      };
    }
  }

  await db.examSession.update({
    where: { id },
    data: { status: status as "DRAFT" | "PUBLISHED" | "COMPLETED" },
  });

  // "Sat" is the end of the marking, so it closes the mark sheets these
  // examinations produced. Until now COMPLETED was a label nothing read, and
  // Assessment.isLocked was a column two places checked and nothing ever set —
  // a lock that could not be applied is not a lock. Reopening lifts it, so
  // this is a door rather than a wall.
  const locked = status === "COMPLETED";
  if (locked || session.status === "COMPLETED") {
    const touched = await db.assessment.updateMany({
      where: { examPaper: { sessionId: id } },
      data: { isLocked: locked },
    });
    if (touched.count) {
      await db.auditLog.create({
        data: {
          userId: user.id,
          actorLabel: user.fullName,
          action: locked ? "assessment.lock" : "assessment.unlock",
          entity: "ExamSession",
          entityId: id,
          summary: `${locked ? "Locked" : "Unlocked"} ${touched.count} mark sheet${touched.count === 1 ? "" : "s"} for ${session.name}`,
        },
      });
    }
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: `exam.session.${status.toLowerCase()}`,
      entity: "ExamSession",
      entityId: id,
      summary: `${session.name}: ${status.toLowerCase()}`,
    },
  });

  revalidatePath("/exams");
  revalidatePath(`/exams/${id}`);
  return { ok: true, message: status === "PUBLISHED" ? "Published." : "Saved." };
}

/**
 * Enters a year group for a session.
 *
 * Index numbers are handed out here, in one pass, in name order across the
 * whole level — so a candidate's number does not depend on which class they
 * happen to be in, and two pupils in different sections do not both become
 * number 14 of their class.
 *
 * Running it again adds whoever has arrived since and leaves existing numbers
 * alone. Re-numbering candidates who already have a number printed on their
 * slip is how two scripts come back under the same index.
 */
export async function enterCandidatesAction(formData: FormData): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.exam.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const sessionId = text(formData, "sessionId");
  const classLevelId = text(formData, "classLevelId");
  if (!sessionId || !classLevelId) return { error: "Which examinations, and which year?" };

  const session = await db.examSession.findUnique({
    where: { id: sessionId },
    select: { id: true, startsOn: true, academicYearId: true },
  });
  if (!session) return { error: "Those examinations were not found." };

  const level = await db.classLevel.findUnique({
    where: { id: classLevelId },
    select: { name: true },
  });
  if (!level) return { error: "That year group was not found." };

  const students = await db.student.findMany({
    where: {
      status: "ENROLLED",
      enrollments: {
        some: {
          status: "ACTIVE",
          academicYearId: session.academicYearId,
          classSection: { classLevelId },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      enrollments: {
        where: { status: "ACTIVE", academicYearId: session.academicYearId },
        take: 1,
        select: { classSectionId: true },
      },
    },
  });

  if (students.length === 0) {
    return { error: `No enrolled pupils were found in ${level.name}.` };
  }

  const already = await db.examCandidate.findMany({
    where: { sessionId, studentId: { in: students.map((student) => student.id) } },
    select: { studentId: true },
  });
  const entered = new Set(already.map((candidate) => candidate.studentId));
  const fresh = students.filter((student) => !entered.has(student.id));

  if (fresh.length === 0) {
    return { ok: true, message: `Everyone in ${level.name} is already entered.` };
  }

  // The highest number already handed out in this session, so a second year
  // group carries on from the first rather than starting again at one.
  const last = await db.examCandidate.findFirst({
    where: { sessionId },
    orderBy: { candidateNo: "desc" },
    select: { candidateNo: true },
  });
  const prefix = candidatePrefix(session.startsOn);
  const from = last ? Number.parseInt(last.candidateNo.split("-").pop() ?? "0", 10) : 0;
  let next = Number.isFinite(from) ? from : 0;

  await db.examCandidate.createMany({
    data: fresh.map((student) => {
      next += 1;
      return {
        sessionId,
        studentId: student.id,
        candidateNo: `${prefix}-${String(next).padStart(4, "0")}`,
        classSectionId: student.enrollments[0]?.classSectionId ?? null,
      };
    }),
    skipDuplicates: true,
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "exam.candidates.enter",
      entity: "ExamSession",
      entityId: sessionId,
      summary: `Entered ${fresh.length} candidate${fresh.length === 1 ? "" : "s"} from ${level.name}`,
    },
  });

  revalidatePath(`/exams/${sessionId}`);
  return {
    ok: true,
    message: `${fresh.length} candidate${fresh.length === 1 ? "" : "s"} entered from ${level.name}.`,
  };
}

/** Adds or edits one paper. */
export async function savePaperAction(
  _previous: ExamState,
  formData: FormData,
): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.exam.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const sessionId = text(formData, "sessionId");
  const subjectId = text(formData, "subjectId");
  const classLevelId = text(formData, "classLevelId");
  if (!sessionId) return { error: "Which examinations?" };
  if (!subjectId) return { error: "Which subject?" };
  if (!classLevelId) return { error: "Which year group?" };

  const startsAt = new Date(text(formData, "startsAt"));
  if (Number.isNaN(startsAt.getTime())) return { error: "When does it start?" };

  const durationMins = number(formData, "durationMins", 90);
  if (durationMins < 5 || durationMins > 600) {
    return { error: "A paper lasts between five minutes and ten hours." };
  }

  const maxMarksRaw = text(formData, "maxMarks");
  const maxMarks = maxMarksRaw ? number(formData, "maxMarks", 0) : null;
  if (maxMarks !== null && maxMarks <= 0) return { error: "Marks out of what?" };

  const weightRaw = text(formData, "weight");
  const weight = weightRaw ? Number.parseFloat(weightRaw) : null;
  if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 100)) {
    return { error: "The weight is a share of the subject mark, between 0 and 100." };
  }

  const data = {
    sessionId,
    subjectId,
    classLevelId,
    title: text(formData, "title") || null,
    startsAt,
    durationMins,
    maxMarks,
    weight,
    materials: text(formData, "materials") || null,
    notes: text(formData, "notes") || null,
  };

  const saved = id
    ? await db.examPaper.update({ where: { id }, data, select: { id: true } })
    : await db.examPaper.create({ data, select: { id: true } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "exam.paper.update" : "exam.paper.create",
      entity: "ExamPaper",
      entityId: saved.id,
      summary: `${id ? "Edited" : "Added"} paper in examinations`,
    },
  });

  // Any mark sheets already generated follow the paper. Left alone, the
  // assessment keeps the maximum and the weight it was given at generation
  // while the paper shows the new ones — the mark sheet says one thing, the
  // report card divides by another, and neither errors.
  const drift = await resyncIfGenerated(saved.id);

  revalidatePath(`/exams/${sessionId}`);
  revalidatePath(`/exams/${sessionId}/papers/${saved.id}`);
  return {
    ok: true,
    id: saved.id,
    message: `${id ? "Saved." : "Paper added."}${drift ? ` ${drift}` : ""}`,
  };
}

/** Removes a paper, and with it its seating and invigilation. */
export async function deletePaperAction(formData: FormData): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.exam.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "Which paper?" };

  const paper = await db.examPaper.findUnique({
    where: { id },
    select: {
      sessionId: true,
      subject: { select: { name: true } },
      session: { select: { status: true } },
      seats: { where: { status: { not: "EXPECTED" } }, take: 1, select: { id: true } },
      assessments: { select: { id: true, _count: { select: { scores: true } } } },
    },
  });
  if (!paper) return { error: "That paper was not found." };

  const entered = paper.assessments.reduce((sum, one) => sum + one._count.scores, 0);
  if (entered) {
    return {
      error: `${entered} mark${entered === 1 ? " has" : "s have"} been entered against this paper. Deleting it would leave them in the gradebook belonging to nothing.`,
    };
  }

  // A register has been marked against it: somebody sat this. Deleting it
  // would take the record of who was present with it.
  if (paper.seats.length) {
    return {
      error:
        "The hall register has already been marked for this paper. It cannot be deleted without losing who sat it.",
    };
  }

  await db.$transaction([
    // The generated columns are empty — that was just checked — so they go
    // with the paper rather than staying behind in the gradebook with nothing
    // to explain them.
    db.assessment.deleteMany({ where: { examPaperId: id } }),
    db.examPaper.delete({ where: { id } }),
  ]);

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "exam.paper.delete",
      entity: "ExamPaper",
      entityId: id,
      summary: `Removed paper: ${paper.subject.name}`,
    },
  });

  revalidatePath(`/exams/${paper.sessionId}`);
  return { ok: true, message: "Paper removed." };
}

/**
 * Allocates seats for a paper.
 *
 * Wipes what was there and lays it out again, which is deliberate: a partial
 * re-seat leaves some candidates where they were and some moved, and the two
 * hall lists in circulation then disagree. It refuses once the register has
 * been marked, because by then the seating is a record of where people sat.
 */
export async function allocateSeatsAction(formData: FormData): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.exam.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const paperId = text(formData, "paperId");
  const venueIds = formData.getAll("venueIds").map(String).filter(Boolean);
  if (!paperId) return { error: "Which paper?" };
  if (venueIds.length === 0) return { error: "Choose at least one hall." };

  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: {
      sessionId: true,
      seats: { where: { status: { not: "EXPECTED" } }, take: 1, select: { id: true } },
      assessments: { select: { _count: { select: { scores: true } } } },
    },
  });
  if (!paper) return { error: "That paper was not found." };

  // Marks are the harder floor. The register check above can be undone — the
  // hall toggle writes a seat back to EXPECTED on a second tap — but a mark
  // entered against a seat is a script somebody read.
  const marked = paper.assessments.reduce((sum, one) => sum + one._count.scores, 0);
  if (marked) {
    return {
      error: `${marked} mark${marked === 1 ? " has" : "s have"} already been entered for this paper. Re-seating would renumber the scripts they came from.`,
    };
  }

  if (paper.seats.length) {
    return {
      error:
        "The register has already been marked for this paper, so the seating is now a record of where people sat. Clear the register first if it really must be laid out again.",
    };
  }

  const venues = await db.examVenue.findMany({
    where: { id: { in: venueIds } },
    select: { id: true, name: true, capacity: true },
  });
  // Kept in the order the halls were chosen, which is the order they fill.
  const halls: Hall[] = venueIds
    .map((id) => venues.find((venue) => venue.id === id))
    .filter((venue): venue is Hall => Boolean(venue));

  if (halls.length === 0) return { error: "Those halls were not found." };

  const candidates = await candidatesForPaper(paperId);
  if (candidates.length === 0) {
    return {
      error:
        "No candidates are entered for this paper. Enter the year group first, and check the subject is offered to it.",
    };
  }

  const { plan, unseated } = planSeats(candidates, halls);

  await db.$transaction([
    db.examSeat.deleteMany({ where: { paperId } }),
    db.examSeat.createMany({
      data: plan.map((seat) => ({
        paperId,
        candidateId: seat.candidateId,
        venueId: seat.venueId,
        seatNo: seat.seatNo,
      })),
    }),
  ]);

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "exam.seats.allocate",
      entity: "ExamPaper",
      entityId: paperId,
      summary: `Seated ${plan.length} candidate${plan.length === 1 ? "" : "s"} across ${halls.length} hall${halls.length === 1 ? "" : "s"}`,
    },
  });

  revalidatePath(`/exams/${paper.sessionId}`);
  revalidatePath(`/exams/${paper.sessionId}/papers/${paperId}`);

  return {
    ok: true,
    message: unseated
      ? `${plan.length} seated — ${unseated} candidate${unseated === 1 ? " has" : "s have"} nowhere to sit. Add another hall.`
      : `${plan.length} candidates seated.`,
  };
}

/** Puts a member of staff on a paper, or takes them off it. */
export async function setInvigilatorAction(formData: FormData): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.exam.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const paperId = text(formData, "paperId");
  const staffId = text(formData, "staffId");
  const role = text(formData, "role") === "CHIEF" ? "CHIEF" : "ASSISTANT";
  const remove = text(formData, "remove") === "1";
  if (!paperId || !staffId) return { error: "Which paper, and who?" };

  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { sessionId: true, startsAt: true, durationMins: true },
  });
  if (!paper) return { error: "That paper was not found." };

  if (remove) {
    await db.examInvigilator.deleteMany({ where: { paperId, staffId } });
  } else {
    // Told here rather than found by the clash report afterwards: somebody
    // adding an invigilator is looking at one paper, and the paper they are
    // already on is a different row on a different screen.
    const start = paper.startsAt.getTime();
    const end = start + paper.durationMins * 60_000;
    const others = await db.examInvigilator.findMany({
      where: { staffId, paperId: { not: paperId }, paper: { sessionId: paper.sessionId } },
      select: {
        paper: {
          select: {
            startsAt: true,
            durationMins: true,
            subject: { select: { name: true } },
            classLevel: { select: { name: true } },
          },
        },
      },
    });

    const clash = others.find((other) => {
      const otherStart = other.paper.startsAt.getTime();
      const otherEnd = otherStart + other.paper.durationMins * 60_000;
      return start < otherEnd && otherStart < end;
    });
    if (clash) {
      return {
        error: `They are already invigilating ${clash.paper.subject.name} (${clash.paper.classLevel.name}) at that hour.`,
      };
    }

    await db.examInvigilator.upsert({
      where: { paperId_staffId: { paperId, staffId } },
      create: { paperId, staffId, role },
      update: { role },
    });
  }

  revalidatePath(`/exams/${paper.sessionId}`);
  revalidatePath(`/exams/${paper.sessionId}/papers/${paperId}`);
  return { ok: true, message: remove ? "Removed." : "Added." };
}

/**
 * Marks the hall register.
 *
 * A separate permission from setting the examinations up, because the person
 * who does this is standing in the hall with the sheet: an invigilating
 * teacher, not the exams officer.
 */
export async function markSeatAction(formData: FormData): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.exam.attendance");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const seatId = text(formData, "seatId");
  const status = text(formData, "status");
  if (!seatId) return { error: "Which candidate?" };
  if (!["EXPECTED", "PRESENT", "ABSENT"].includes(status)) {
    return { error: "Present, absent, or still expected." };
  }

  const seat = await db.examSeat.findUnique({
    where: { id: seatId },
    select: { paperId: true, paper: { select: { sessionId: true } } },
  });
  if (!seat) return { error: "That seat was not found." };

  // Your own hall, unless you are the one who set the examinations up.
  // exam.attendance is held by every teacher, and taken to mean "any hall" it
  // would let any of them mark any candidate in the school.
  if (
    !userCan(user, "assessment.exam.manage") &&
    !(await invigilates(user.staffId, seat.paperId))
  ) {
    return {
      error: "You are not invigilating this paper, so its register is not yours to mark.",
    };
  }

  await db.examSeat.update({
    where: { id: seatId },
    data: {
      status: status as "EXPECTED" | "PRESENT" | "ABSENT",
      remark: text(formData, "remark") || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "exam.seat.mark",
      entity: "ExamSeat",
      entityId: seatId,
      summary: `Marked a candidate ${status.toLowerCase()}`,
    },
  });

  revalidatePath(`/exams/${seat.paper.sessionId}/papers/${seat.paperId}`);
  return { ok: true, message: "Marked." };
}

/** Saves an examination hall. */
export async function saveVenueAction(
  _previous: ExamState,
  formData: FormData,
): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.exam.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const name = text(formData, "name");
  if (!name) return { error: "Give the hall a name." };

  const capacity = number(formData, "capacity", 0);
  if (capacity <= 0) return { error: "How many candidates does it seat?" };

  const clash = await db.examVenue.findFirst({
    where: { name, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (clash) return { error: `There is already a hall called ${name}.` };

  const data = {
    name,
    capacity,
    notes: text(formData, "notes") || null,
    active: formData.get("active") !== null,
  };

  const saved = id
    ? await db.examVenue.update({ where: { id }, data, select: { id: true } })
    : await db.examVenue.create({ data, select: { id: true } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "exam.venue.update" : "exam.venue.create",
      entity: "ExamVenue",
      entityId: saved.id,
      summary: `${id ? "Edited" : "Added"} examination hall: ${name} (seats ${capacity})`,
    },
  });

  revalidatePath("/exams/venues");
  return { ok: true, message: id ? "Saved." : "Hall added." };
}

/**
 * Creates the mark sheet column for every class sitting this paper.
 *
 * The exams office's job, not a teacher's: it writes into several teachers'
 * gradebooks at once. It is deliberately gated on exam.manage rather than on
 * assessment.create — granting the exams office assessment.create to make this
 * work would let them invent arbitrary columns in anybody's mark sheet, where
 * this can only ever create the one row the paper describes.
 */
export async function generatePaperMarkSheetsAction(
  formData: FormData,
): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.exam.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const paperId = text(formData, "paperId");
  if (!paperId) return { error: "Which paper?" };

  const result = await syncPaperAssessments(paperId);
  if (!result.ok) return { error: result.error };

  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { sessionId: true, subject: { select: { name: true } } },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "assessment.exam.generate",
      entity: "ExamPaper",
      entityId: paperId,
      summary: `Mark sheets for ${paper?.subject.name ?? "a paper"}: ${result.created} created, ${result.updated} refreshed`,
    },
  });

  if (paper) {
    revalidatePath(`/exams/${paper.sessionId}/papers/${paperId}`);
    revalidatePath(`/exams/${paper.sessionId}/papers/${paperId}/marks`);
  }
  revalidatePath("/gradebook");

  return {
    ok: true,
    message:
      result.created && result.updated
        ? `${result.created} mark sheet${result.created === 1 ? "" : "s"} created, ${result.updated} refreshed: ${result.sections.join(", ")}.`
        : result.created
          ? `Mark sheets ready for ${result.sections.join(", ")}.`
          : `Refreshed the mark sheets for ${result.sections.join(", ")}.`,
  };
}

export type ScriptMark = { candidateId: string; score: number | null };

/**
 * Saves a paper's marks, keyed on the index number rather than on a pupil.
 *
 * The marker is holding a pile of scripts sorted by seat, each carrying an
 * index number and no name. Keying on candidateId is not a convenience — it is
 * the only identifier physically present on the thing being marked.
 *
 * **Absence is not in the payload.** It is read from the hall register, which
 * the invigilator marked. Two independent absent flags — one set in the hall,
 * one set by whoever types the marks — is precisely the disagreement this
 * feature exists to remove, and the register is the one with somebody's
 * signature under it.
 */
export async function saveExamPaperMarks(
  paperId: string,
  entries: ScriptMark[],
): Promise<ExamState> {
  let user;
  try {
    user = await authorize(["assessment.grade", "assessment.exam.marks"]);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: {
      sessionId: true,
      maxMarks: true,
      subject: { select: { name: true } },
      assessments: { select: { id: true, maxScore: true, isLocked: true, title: true } },
      session: { select: { term: { select: { isLocked: true } } } },
    },
  });
  if (!paper) return { error: "That paper was not found." };

  // The denominator is the assessment's, not the paper's.
  //
  // The report card divides by Assessment.maxScore, which is a copy taken when
  // the mark sheets were generated. The paper's own "out of" can be edited
  // afterwards, and a mark validated against the new figure but divided by the
  // old one comes out over 100% — which finds no grade band, so the subject
  // drops silently out of the GPA and the aggregate while the inflated total
  // still raises the class average and moves everybody's position.
  const maxFor = new Map(
    paper.assessments.map((one) => [one.id, Number(one.maxScore)]),
  );

  // A locked column is locked through this door too. saveScores in the
  // gradebook has always refused one; this path did not, so the same column
  // was writable from the examinations side and refused from the gradebook —
  // two doors into one mark sheet with two different rules, which is how a
  // lock comes to mean nothing.
  const lockedSheets = new Set(
    paper.assessments.filter((one) => one.isLocked).map((one) => one.id),
  );
  if (paper.session.term?.isLocked) {
    return { error: "This term is locked. Ask an administrator to reopen it." };
  }

  const rows = await paperMarkSheet(paperId);
  const byCandidate = new Map(rows.map((row) => [row.candidateId, row]));

  // A holder of exam.marks marks the whole paper across every class. Anyone
  // else marks only the classes that are theirs — and a marker holding half
  // the pile needs to be told which half, so the refusal names the section.
  const wholePaper = userCan(user, "assessment.exam.marks");
  const mine = new Set<string>();
  if (!wholePaper) {
    const offerings = [...new Set(rows.map((row) => row.offeringId).filter(Boolean))];
    for (const offeringId of offerings as string[]) {
      if (!(await offeringOutOfScope(user, offeringId))) mine.add(offeringId);
    }
  }

  type Write = { assessmentId: string; studentId: string; score: number | null; isAbsent: boolean };
  const writes: Write[] = [];

  for (const entry of entries) {
    const row = byCandidate.get(entry.candidateId);
    if (!row) return { error: "A mark was submitted for a candidate not on this paper." };
    if (row.blockedReason) {
      return { error: `${row.candidateNo} cannot be marked: ${row.blockedReason}` };
    }
    if (!row.assessmentId || !row.offeringId) {
      return { error: `${row.candidateNo} has no mark sheet to write to.` };
    }
    if (!wholePaper && !mine.has(row.offeringId)) {
      return {
        error: `${row.marksSection ?? "That class"} is not yours to mark. Ask the exams office, or whoever teaches it.`,
      };
    }

    // The register decides. A candidate the invigilator wrote down as absent
    // gets an absence, whatever was typed against them.
    if (lockedSheets.has(row.assessmentId)) {
      return {
        error: `The mark sheet for ${row.marksSection ?? "that class"} is locked and cannot be changed.`,
      };
    }

    const isAbsent = row.seatStatus === "ABSENT";
    const max = maxFor.get(row.assessmentId) ?? paper.maxMarks ?? 100;
    if (!isAbsent && entry.score !== null) {
      if (!Number.isFinite(entry.score) || entry.score < 0 || entry.score > max) {
        return {
          error: `${row.candidateNo} has ${entry.score}, which is outside 0–${max} for ${paper.subject.name}.`,
        };
      }
    }

    writes.push({
      assessmentId: row.assessmentId,
      studentId: row.studentId,
      score: isAbsent ? null : entry.score,
      isAbsent,
    });
  }

  const toWrite = writes.filter((row) => row.score !== null || row.isAbsent);
  const toClear = writes.filter((row) => row.score === null && !row.isAbsent);

  await db.$transaction([
    ...toWrite.map((row) =>
      db.assessmentScore.upsert({
        where: {
          assessmentId_studentId: { assessmentId: row.assessmentId, studentId: row.studentId },
        },
        create: { ...row, gradedById: user.staffId },
        update: { score: row.score, isAbsent: row.isAbsent, gradedById: user.staffId },
      }),
    ),
    // A blanked cell is "not marked yet", which the report card treats as a
    // component that does not exist rather than as a zero.
    ...toClear.map((row) =>
      db.assessmentScore.deleteMany({
        where: { assessmentId: row.assessmentId, studentId: row.studentId },
      }),
    ),
  ]);

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "assessment.exam.marks",
      entity: "ExamPaper",
      entityId: paperId,
      summary: `Entered ${toWrite.length} mark${toWrite.length === 1 ? "" : "s"} for ${paper.subject.name}`,
    },
  });

  revalidatePath(`/exams/${paper.sessionId}/papers/${paperId}/marks`);
  // The gradebook is where these land, and nothing revalidated it after a
  // mark save before now.
  revalidatePath("/gradebook");
  for (const offeringId of new Set(rows.map((row) => row.offeringId).filter(Boolean))) {
    revalidatePath(`/gradebook/${offeringId}`);
  }

  return {
    ok: true,
    message: `${toWrite.length} mark${toWrite.length === 1 ? "" : "s"} saved.`,
  };
}

/**
 * Sets only what a paper needs before its marks can go anywhere.
 *
 * Its own action rather than a partial savePaperAction: that one requires a
 * subject and a year group, and a small form asking for two numbers has no
 * business resubmitting the whole paper — a missing hidden field would have
 * silently rewritten the timetable slot.
 */
export async function setPaperMarkingAction(formData: FormData): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.exam.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const paperId = text(formData, "paperId");
  if (!paperId) return { error: "Which paper?" };

  const maxMarks = number(formData, "maxMarks", 0);
  if (maxMarks <= 0) return { error: "What is the paper marked out of?" };

  const weight = Number.parseFloat(text(formData, "weight"));
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    return { error: "The weight is a share of the subject mark, between 0 and 100." };
  }

  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { sessionId: true },
  });
  if (!paper) return { error: "That paper was not found." };

  await db.examPaper.update({ where: { id: paperId }, data: { maxMarks, weight } });
  const drift = await resyncIfGenerated(paperId);

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "exam.paper.marking",
      entity: "ExamPaper",
      entityId: paperId,
      summary: `Marked out of ${maxMarks}, carrying ${weight}% of the subject`,
    },
  });

  revalidatePath(`/exams/${paper.sessionId}/papers/${paperId}`);
  return { ok: true, message: `Saved.${drift ? ` ${drift}` : ""}` };
}

/**
 * Pushes a changed paper back onto the mark sheets it has already produced.
 *
 * Not exported — a "use server" module may only export server actions, and
 * this is a helper two of them share.
 *
 * It returns a sentence rather than throwing, because the paper has already
 * been saved by the time it runs: the alternative to saying "the sheets could
 * not be updated, and here is why" is leaving them silently out of step.
 */
async function resyncIfGenerated(paperId: string): Promise<string | null> {
  const existing = await db.assessment.count({ where: { examPaperId: paperId } });
  if (existing === 0) return null;

  const result = await syncPaperAssessments(paperId);
  return result.ok
    ? `The ${existing} mark sheet${existing === 1 ? "" : "s"} already generated were updated to match.`
    : `The mark sheets could NOT be updated to match: ${result.error}`;
}

/**
 * Publishes every class's marks for one paper.
 *
 * A paper is marked once across three classes and then had to be published
 * three times, from three different gradebook pages, because publication hangs
 * off the assessment. The exams officer who marked it is not the teacher who
 * owns any of those pages.
 *
 * It goes through publishAssessment rather than writing isPublished directly:
 * that function is what notifies every pupil and every guardian who receives
 * reports, and a second publish path that skipped the notification would mean
 * a mark visible in the portal that nobody was told about.
 *
 * Still gated on assessment.publish, which the registrar deliberately does not
 * hold. Marking is the exams office's work; releasing marks to families is the
 * head's, and it cannot be undone by anybody once the messages have gone.
 */
export async function publishPaperMarksAction(formData: FormData): Promise<ExamState> {
  let user;
  try {
    user = await authorize("assessment.publish");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const paperId = text(formData, "paperId");
  if (!paperId) return { error: "Which paper?" };

  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: {
      sessionId: true,
      subject: { select: { name: true } },
      assessments: {
        select: {
          id: true,
          isPublished: true,
          offeringId: true,
          offering: { select: { classSection: { select: { name: true } } } },
          _count: { select: { scores: true } },
        },
      },
    },
  });
  if (!paper) return { error: "That paper was not found." };

  const unpublished = paper.assessments.filter((one) => !one.isPublished);
  if (unpublished.length === 0) {
    return { ok: true, message: "Every class's marks are already published." };
  }

  // A class with nothing entered is not published. Publishing an empty column
  // tells families the results are out and shows them nothing, which generates
  // exactly the phone calls the notification was meant to save.
  const empty = unpublished.filter((one) => one._count.scores === 0);
  const ready = unpublished.filter((one) => one._count.scores > 0);
  if (ready.length === 0) {
    return {
      error: "No marks have been entered for this paper yet, so there is nothing to publish.",
    };
  }

  const failed: string[] = [];
  for (const assessment of ready) {
    const result = await publishAssessment(assessment.id);
    if (result && "error" in result && result.error) {
      failed.push(`${assessment.offering.classSection.name}: ${result.error}`);
    }
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "assessment.exam.publish",
      entity: "ExamPaper",
      entityId: paperId,
      summary: `Published ${ready.length - failed.length} of ${ready.length} class mark sheets for ${paper.subject.name}`,
    },
  });

  revalidatePath(`/exams/${paper.sessionId}/papers/${paperId}`);
  revalidatePath("/gradebook");
  for (const assessment of ready) revalidatePath(`/gradebook/${assessment.offeringId}`);

  const notes: string[] = [];
  if (empty.length) {
    notes.push(
      `${empty.map((one) => one.offering.classSection.name).join(", ")} had no marks entered and ${empty.length === 1 ? "was" : "were"} left unpublished.`,
    );
  }
  if (failed.length) notes.push(failed.join(" "));

  return {
    ok: failed.length === 0,
    error: failed.length ? failed.join(" ") : undefined,
    message: `Published for ${ready.length - failed.length} class${ready.length - failed.length === 1 ? "" : "es"}.${notes.length ? ` ${notes.join(" ")}` : ""}`,
  };
}
