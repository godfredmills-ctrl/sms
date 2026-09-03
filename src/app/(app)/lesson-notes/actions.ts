"use server";

import { revalidatePath } from "next/cache";

import { authorize, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canTransition,
  editable,
  missingSections,
  reflectionEditable,
  weekEndingFor,
  weeksInTerm,
} from "@/lib/lesson-notes";

export type NoteState = {
  ok?: boolean;
  error?: string;
  message?: string;
  noteId?: string;
  /** Named so the form can point at what is still empty. */
  missing?: string[];
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

/**
 * A textarea of one item per line, as a list.
 *
 * Objectives, materials and competencies are lists on the form and a teacher
 * writes them one to a line. A comma-separated box would be quicker to build
 * and wrong: "iodine solution, green leaves, a beaker of hot water" is three
 * items to a person and one to a split on commas as soon as somebody writes
 * "a beaker of hot, not boiling, water".
 */
function lines(formData: FormData, key: string): string[] {
  return String(formData.get(key) ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Whether this person may write this note, and whether they may vet it.
 *
 * A teacher writes for their own classes only. The check is on the offering
 * rather than on the note, because that is where the teacher is recorded, and
 * because a note is created before it exists.
 */
async function permissionsFor(offeringId: string) {
  const user = await authorize([
    "academic.lessonnote.write",
    "academic.lessonnote.vet",
  ]);

  const offering = await db.subjectOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      teacherId: true,
      coTeacherIds: true,
      termId: true,
      subject: { select: { name: true } },
      classSection: { select: { name: true, classLevel: { select: { name: true } } } },
      term: { select: { id: true, name: true, startDate: true, endDate: true } },
    },
  });

  if (!offering) return { user, offering: null, mine: false, mayVet: false };

  const mine =
    Boolean(user.staffId) &&
    [offering.teacherId, ...offering.coTeacherIds].includes(user.staffId ?? "");

  return {
    user,
    offering,
    mine,
    mayVet: userCan(user, "academic.lessonnote.vet"),
  };
}

// ---------------------------------------------------------------------------

/**
 * Creates or updates a note.
 *
 * The same action for both, because a teacher opening week 4 for the first
 * time and coming back to it on Thursday are the same act to them. The unique
 * index on (offering, week) is what makes that safe: two people cannot each
 * create their own week 4 and each believe theirs was the one vetted.
 */
export async function saveLessonNoteAction(
  _previous: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const offeringId = text(formData, "offeringId");
  if (!offeringId) return { error: "No subject given." };

  let context;
  try {
    context = await permissionsFor(offeringId);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const { user, offering, mine } = context;
  if (!offering) return { error: "That subject is not taught in this class." };
  if (!mine) {
    return {
      error:
        "You can only write lesson notes for your own classes. Ask the registrar if this subject should be assigned to you.",
    };
  }
  if (!offering.term) {
    return { error: "That subject is not attached to a term, so it has no weeks." };
  }

  const weekNumber = Number(text(formData, "weekNumber"));
  const weeks = weeksInTerm(offering.term);
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > weeks) {
    return { error: `${offering.term.name} runs for ${weeks} weeks.` };
  }

  const existing = await db.lessonNote.findUnique({
    where: { offeringId_weekNumber: { offeringId, weekNumber } },
    select: { id: true, status: true },
  });

  // The body is fixed once it is handed in. A note that can change after it
  // was signed off is a signature on a document that no longer exists.
  if (existing && !editable(existing.status)) {
    if (existing.status === "SUBMITTED") {
      return {
        error:
          "This note is with the head for vetting. Wait for it to come back, or ask them to send it back to you.",
      };
    }
    return {
      error:
        "This note has been approved. Ask for it to be reopened if it genuinely needs changing.",
    };
  }

  const body = {
    topic: text(formData, "topic"),
    subTopic: optional(formData, "subTopic"),
    objectives: lines(formData, "objectives"),
    rpk: optional(formData, "rpk"),
    materials: lines(formData, "materials"),
    coreCompetencies: lines(formData, "coreCompetencies"),
    introduction: optional(formData, "introduction"),
    development: optional(formData, "development"),
    closure: optional(formData, "closure"),
    evaluation: optional(formData, "evaluation"),
    homework: optional(formData, "homework"),
    reflection: optional(formData, "reflection"),
    periodsPlanned: Math.max(0, Math.min(50, Number(text(formData, "periodsPlanned") || "0"))),
  };

  // The database refuses a note with no topic, which is right and is not a
  // sentence anybody should have to read from a constraint violation.
  if (!body.topic) return { error: "A note needs a topic. It is what the week is about." };

  const note = existing
    ? await db.lessonNote.update({
        where: { id: existing.id },
        data: body,
        select: { id: true },
      })
    : await db.lessonNote.create({
        data: {
          ...body,
          offeringId,
          weekNumber,
          weekEnding: weekEndingFor(weekNumber, offering.term),
          createdById: user.id,
        },
        select: { id: true },
      });

  revalidatePath("/lesson-notes");
  revalidatePath(`/lesson-notes/${note.id}`);

  return {
    ok: true,
    noteId: note.id,
    message: "Saved.",
    missing: missingSections(body),
  };
}

/**
 * Hands a note in, or sends it back, or approves it.
 *
 * One action for every move, driven by the same table the screen draws its
 * buttons from. Two lists of what is allowed is how a button appears that
 * answers 403.
 */
export async function moveLessonNoteAction(
  _previous: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const noteId = text(formData, "id");
  const to = text(formData, "to");
  if (!noteId || !to) return { error: "Nothing to do." };

  const note = await db.lessonNote.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      status: true,
      offeringId: true,
      weekNumber: true,
      topic: true,
      subTopic: true,
      objectives: true,
      rpk: true,
      materials: true,
      coreCompetencies: true,
      introduction: true,
      development: true,
      closure: true,
      evaluation: true,
      homework: true,
      reflection: true,
      offering: {
        select: {
          subject: { select: { name: true } },
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!note) return { error: "That note no longer exists." };

  let context;
  try {
    context = await permissionsFor(note.offeringId);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const { user, mine, mayVet } = context;

  // Which hat this person is wearing. A head who also teaches writes their own
  // notes as a teacher and vets everybody else's as a vetter, and the two are
  // decided per note rather than per person.
  const role: "teacher" | "vetter" = mine && !isVetterMove(to) ? "teacher" : "vetter";

  if (role === "teacher" && !mine) {
    return { error: "That is not your note." };
  }
  if (role === "vetter" && !mayVet) {
    return { error: "Vetting lesson notes needs the approval permission." };
  }

  /*
   * A teacher cannot vet their own note, whatever permissions they hold.
   *
   * This is the one rule the whole module exists for. A head of department who
   * teaches has both permissions, and without this they could write a note on
   * Friday and sign it off themselves on the same afternoon, which is a vetted
   * note in the same sense that a self-issued receipt is proof of payment.
   */
  if (isVetterMove(to) && mine) {
    return {
      error:
        "You cannot vet your own lesson note. Somebody else has to look at it, which is the point of vetting it.",
    };
  }

  if (!canTransition(note.status, to, role)) {
    return { error: "That is not a move this note can make from where it is." };
  }

  // Handing in an incomplete note wastes the head's time and the teacher's.
  if (to === "SUBMITTED" && role === "teacher") {
    const missing = missingSections(note);
    if (missing.length) {
      return {
        error: `This note is not finished. Still empty: ${missing.join(", ")}.`,
        missing,
      };
    }
  }

  const remarks = optional(formData, "vetterRemarks");
  if (to === "RETURNED" && !remarks) {
    return {
      error:
        "Say what needs changing. A note sent back without remarks leaves the teacher guessing, which is how it comes back three times.",
    };
  }

  const now = new Date();

  await db.lessonNote.update({
    where: { id: noteId },
    data: {
      status: to as never,
      // Submitting stamps the date. Approving and returning keep whatever it
      // was, because both mean the note was handed in at some point and the
      // database refuses a vetted note with no submission date.
      submittedAt: to === "SUBMITTED" ? now : undefined,
      ...(isVetterMove(to)
        ? { vettedById: user.staffId, vettedAt: now, vetterRemarks: remarks }
        : {}),
      // Reopening puts it back in the queue, so the previous vetting is
      // cleared rather than left standing against a note nobody has looked at
      // since. The database refuses a submitted note that carries a vetter.
      ...(to === "SUBMITTED" && role === "vetter"
        ? { vettedById: null, vettedAt: null, vetterRemarks: null }
        : {}),
      // A teacher submitting again clears the last set of remarks: they
      // belonged to the version that has now been changed.
      ...(to === "SUBMITTED" && role === "teacher"
        ? { vettedById: null, vettedAt: null, vetterRemarks: null }
        : {}),
    },
  });

  const what = `${note.offering.subject.name}, ${note.offering.classSection.classLevel.name} ${note.offering.classSection.name}, week ${note.weekNumber}`;

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: `academic.lessonnote.${to.toLowerCase()}`,
      entity: "LessonNote",
      entityId: noteId,
      summary: `${what}: ${to.toLowerCase()}${remarks ? `, "${remarks.slice(0, 80)}"` : ""}`,
    },
  });

  revalidatePath("/lesson-notes");
  revalidatePath("/lesson-notes/vetting");
  revalidatePath(`/lesson-notes/${noteId}`);

  return {
    ok: true,
    message:
      to === "SUBMITTED"
        ? "Handed in."
        : to === "APPROVED"
          ? "Approved."
          : "Sent back to the teacher.",
  };
}

/** Approving, returning and reopening are the vetter's moves. */
function isVetterMove(to: string): boolean {
  return to === "APPROVED" || to === "RETURNED";
}

/**
 * The reflection, written after the week has been taught.
 *
 * Its own action because it is the one part of the note that stays open once
 * the note is approved. Folding it into the save would mean either reopening
 * an approved note to write it, or a teacher never writing it, and in practice
 * it would be the second.
 */
export async function saveReflectionAction(
  _previous: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const noteId = text(formData, "id");
  if (!noteId) return { error: "No note given." };

  const note = await db.lessonNote.findUnique({
    where: { id: noteId },
    select: { status: true, offeringId: true },
  });
  if (!note) return { error: "That note no longer exists." };

  let context;
  try {
    context = await permissionsFor(note.offeringId);
  } catch (error) {
    return { error: (error as Error).message };
  }

  if (!context.mine) return { error: "That is not your note." };
  if (!reflectionEditable(note.status)) {
    return { error: "The note is with the head. Wait for it to come back." };
  }

  await db.lessonNote.update({
    where: { id: noteId },
    data: { reflection: optional(formData, "reflection") },
  });

  revalidatePath(`/lesson-notes/${noteId}`);
  return { ok: true, message: "Saved." };
}
