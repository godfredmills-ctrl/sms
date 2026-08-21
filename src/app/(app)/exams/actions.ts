"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorize, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  candidatePrefix,
  candidatesForPaper,
  clashesIn,
  invigilates,
  planSeats,
  type Hall,
} from "@/lib/exams";

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

  const data = {
    sessionId,
    subjectId,
    classLevelId,
    title: text(formData, "title") || null,
    startsAt,
    durationMins,
    maxMarks,
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

  revalidatePath(`/exams/${sessionId}`);
  revalidatePath(`/exams/${sessionId}/papers/${saved.id}`);
  return { ok: true, id: saved.id, message: id ? "Saved." : "Paper added." };
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
    },
  });
  if (!paper) return { error: "That paper was not found." };

  // A register has been marked against it: somebody sat this. Deleting it
  // would take the record of who was present with it.
  if (paper.seats.length) {
    return {
      error:
        "The hall register has already been marked for this paper. It cannot be deleted without losing who sat it.",
    };
  }

  await db.examPaper.delete({ where: { id } });

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
    },
  });
  if (!paper) return { error: "That paper was not found." };
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
