"use server";

import { revalidatePath } from "next/cache";

import { can, stageOf, type ApplicationFacts } from "@/lib/admission-rules";
import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";

export type AdmissionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  id?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * The facts an application's stage is derived from, loaded once.
 *
 * Not exported — a "use server" module may only export async functions, and
 * every action below asks the same question before it does anything: where is
 * this application, and is what I am about to do allowed from there.
 */
async function factsFor(applicationId: string) {
  const application = await db.admissionApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      studentId: true,
      offeredOn: true,
      offerExpiresOn: true,
      acceptedOn: true,
      declinedOn: true,
      waitlistRank: true,
      academicYearId: true,
      applyingForLevelId: true,
      student: { select: { status: true, firstName: true, lastName: true } },
      assessments: { select: { score: true } },
      interviews: { select: { decision: true } },
    },
  });
  if (!application) return null;

  const facts: ApplicationFacts = {
    studentStatus: application.student.status,
    assessments: application.assessments.map((entry) => ({
      score: entry.score === null ? null : Number(entry.score),
    })),
    interviews: application.interviews.map((entry) => ({ decision: entry.decision })),
    offeredOn: application.offeredOn,
    offerExpiresOn: application.offerExpiresOn,
    acceptedOn: application.acceptedOn,
    declinedOn: application.declinedOn,
    waitlistRank: application.waitlistRank,
  };

  return { application, facts, stage: stageOf(facts, new Date()) };
}

/** Starts, or edits, an application against an existing applicant record. */
export async function saveApplicationAction(
  _previous: AdmissionState,
  formData: FormData,
): Promise<AdmissionState> {
  let user;
  try {
    user = await authorize("admission.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const studentId = text(formData, "studentId");
  if (!studentId) return { error: "Which applicant?" };

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  if (!year) return { error: "Set a current academic year first." };

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { status: true, firstName: true, lastName: true },
  });
  if (!student) return { error: "That pupil was not found." };

  const fee = text(formData, "applicationFee");
  const applicationFeeMinor = fee ? toMinor(fee) : 0;
  if (!Number.isFinite(applicationFeeMinor) || applicationFeeMinor < 0) {
    return { error: "The assessment fee cannot be negative." };
  }

  const data = {
    academicYearId: year.id,
    applyingForLevelId: text(formData, "applyingForLevelId") || null,
    source: (text(formData, "source") || "WALK_IN") as never,
    siblingId: text(formData, "siblingId") || null,
    applicationFeeMinor,
    applicationFeePaid: formData.get("applicationFeePaid") !== null,
    notes: text(formData, "notes") || null,
  };

  if (id) {
    await db.admissionApplication.update({ where: { id }, data });
  } else {
    // One per child per intake. A child who applied last year and was turned
    // down, or declined, applies again this year on the same pupil record —
    // which is what the decline path assumes when it puts them back to
    // APPLICANT rather than withdrawing them.
    const existing = await db.admissionApplication.findFirst({
      where: { studentId, academicYearId: year.id },
      select: { id: true },
    });
    if (existing) {
      return {
        error: `${student.firstName} ${student.lastName} already has an application for this year.`,
      };
    }
    await db.admissionApplication.create({
      data: { ...data, studentId, createdById: user.id },
    });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "admission.update" : "admission.create",
      entity: "Student",
      entityId: studentId,
      summary: `${id ? "Edited" : "Started"} an application for ${student.firstName} ${student.lastName}`,
    },
  });

  revalidatePath("/admissions");
  revalidatePath(`/students/${studentId}`);
  return { ok: true, message: id ? "Saved." : "Application started." };
}

/**
 * Records an entrance paper's mark.
 *
 * One row per paper per applicant, upserted, so entering Mathematics twice
 * corrects the mark rather than averaging a child against themselves.
 */
export async function saveAssessmentAction(formData: FormData): Promise<AdmissionState> {
  let user;
  try {
    user = await authorize("admission.assess");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const applicationId = text(formData, "applicationId");
  const paper = text(formData, "paper");
  if (!applicationId || !paper) return { error: "Which application, and which paper?" };

  const loaded = await factsFor(applicationId);
  if (!loaded) return { error: "That application was not found." };
  if (!can(loaded.stage, "ASSESS")) {
    return { error: "This application is closed, so its marks cannot be changed." };
  }

  const maxScore = Number.parseFloat(text(formData, "maxScore") || "100");
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return { error: "What is the paper marked out of?" };
  }

  const raw = text(formData, "score");
  const score = raw === "" ? null : Number.parseFloat(raw);
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > maxScore)) {
    return { error: `A mark of ${raw} is outside 0–${maxScore}.` };
  }

  await db.admissionAssessment.upsert({
    where: { applicationId_paper: { applicationId, paper } },
    create: {
      applicationId,
      paper,
      score,
      maxScore,
      satOn: text(formData, "satOn") ? new Date(text(formData, "satOn")) : null,
      assessorId: user.staffId ?? null,
      notes: text(formData, "notes") || null,
    },
    update: {
      score,
      maxScore,
      ...(text(formData, "satOn") ? { satOn: new Date(text(formData, "satOn")) } : {}),
      assessorId: user.staffId ?? null,
      notes: text(formData, "notes") || null,
    },
  });

  revalidatePath("/admissions");
  revalidatePath(`/admissions/${applicationId}`);
  return { ok: true, message: `${paper} recorded.` };
}

/** Records an interview. A second conversation is a second record. */
export async function saveInterviewAction(formData: FormData): Promise<AdmissionState> {
  let user;
  try {
    user = await authorize("admission.interview");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const applicationId = text(formData, "applicationId");
  if (!applicationId) return { error: "Which application?" };

  const loaded = await factsFor(applicationId);
  if (!loaded) return { error: "That application was not found." };
  if (!can(loaded.stage, "INTERVIEW")) {
    return { error: "This application is closed." };
  }

  const decision = text(formData, "decision");
  if (!["RECOMMEND", "RESERVE", "DECLINE"].includes(decision)) {
    return { error: "Recommend, hold in reserve, or do not offer." };
  }

  const heldOn = new Date(text(formData, "heldOn"));
  if (Number.isNaN(heldOn.getTime())) return { error: "When was the interview?" };

  await db.admissionInterview.create({
    data: {
      applicationId,
      heldOn,
      interviewerId: user.staffId ?? null,
      attendees: text(formData, "attendees") || null,
      decision: decision as "RECOMMEND" | "RESERVE" | "DECLINE",
      notes: text(formData, "notes") || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "admission.interview",
      entity: "Student",
      entityId: loaded.application.studentId,
      summary: `Interviewed ${loaded.application.student.firstName} ${loaded.application.student.lastName}: ${decision.toLowerCase()}`,
    },
  });

  revalidatePath("/admissions");
  revalidatePath(`/admissions/${applicationId}`);
  return { ok: true, message: "Interview recorded." };
}

/**
 * Moves an application: offer, waiting list, accept, decline.
 *
 * One action, because they are one sequence and share one answer to what may
 * follow what — and because the stage they are checked against is derived, so
 * asking separately would be four places computing it.
 *
 * Offering also moves the Student record to OFFERED, and accepting leaves it
 * there: enrolling is a separate act with a class to choose, which is the
 * existing stage card on the pupil's profile.
 */
export async function decideApplicationAction(
  formData: FormData,
): Promise<AdmissionState> {
  const applicationId = text(formData, "id");
  const act = text(formData, "act");
  if (!applicationId) return { error: "Which application?" };

  try {
    await authorize("admission.read");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const loaded = await factsFor(applicationId);
  if (!loaded) return { error: "That application was not found." };

  const needed = act === "WAITLIST" ? "admission.manage" : "admission.offer";
  let user;
  try {
    user = await authorize(needed);
  } catch (error) {
    return { error: (error as Error).message };
  }

  if (!can(loaded.stage, act as never)) {
    return {
      error: `That cannot be done to an application that is ${loaded.stage.toLowerCase()}.`,
    };
  }

  const now = new Date();
  const name = `${loaded.application.student.firstName} ${loaded.application.student.lastName}`;
  let message = "Done.";

  if (act === "OFFER") {
    const expires = text(formData, "offerExpiresOn");
    const offerExpiresOn = expires ? new Date(expires) : null;
    if (expires && Number.isNaN(offerExpiresOn!.getTime())) {
      return { error: "When does the offer lapse?" };
    }
    if (offerExpiresOn && offerExpiresOn.getTime() <= now.getTime()) {
      return { error: "An offer cannot lapse before it is made." };
    }

    await db.$transaction([
      db.admissionApplication.update({
        where: { id: applicationId },
        data: {
          offeredOn: now,
          offerExpiresOn,
          offerNote: text(formData, "note") || null,
          // Re-offering after a lapse or a decline clears the old outcome, or
          // the derived stage would go on reporting the answer they gave last
          // time.
          acceptedOn: null,
          declinedOn: null,
          declineReason: null,
          waitlistRank: null,
        },
      }),
      db.student.update({
        where: { id: loaded.application.studentId },
        data: { status: "OFFERED" },
      }),
    ]);
    message = offerExpiresOn
      ? `Offered. It lapses on ${offerExpiresOn.toLocaleDateString("en-GB")}.`
      : "Offered, with no lapse date — the place is held until somebody says otherwise.";
  }

  if (act === "WAITLIST") {
    const given = Number.parseInt(text(formData, "rank"), 10);
    let rank: number;

    if (Number.isFinite(given) && given > 0) {
      rank = given;
    } else {
      // No rank given means the back of that year group's queue, not the
      // front. Defaulting to 1 put every reserve at the head of the list, so
      // the ordering fell through to whoever applied earliest — and when a
      // place came free the board named the wrong child for it.
      const last = await db.admissionApplication.findFirst({
        where: {
          academicYearId: loaded.application.academicYearId,
          applyingForLevelId: loaded.application.applyingForLevelId,
          waitlistRank: { not: null },
          id: { not: applicationId },
        },
        orderBy: { waitlistRank: "desc" },
        select: { waitlistRank: true },
      });
      rank = (last?.waitlistRank ?? 0) + 1;
    }

    await db.admissionApplication.update({
      where: { id: applicationId },
      data: { waitlistRank: rank },
    });
    message = `On the waiting list at number ${rank}.`;
  }

  if (act === "ACCEPT") {
    await db.admissionApplication.update({
      where: { id: applicationId },
      data: { acceptedOn: now, declinedOn: null, declineReason: null },
    });
    message = `${name} is coming. Enrol them from their profile to give them a class.`;
  }

  if (act === "DECLINE") {
    await db.$transaction([
      db.admissionApplication.update({
        where: { id: applicationId },
        data: {
          declinedOn: now,
          declineReason: text(formData, "note") || null,
          acceptedOn: null,
          waitlistRank: null,
        },
      }),
      // Back to APPLICANT rather than WITHDRAWN: the family declined a place,
      // which is not the school withdrawing the child, and next year they
      // often apply again.
      db.student.update({
        where: { id: loaded.application.studentId },
        data: { status: "APPLICANT" },
      }),
    ]);
    message = "Recorded as declined. The place is free again.";
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: `admission.${act.toLowerCase()}`,
      entity: "Student",
      entityId: loaded.application.studentId,
      summary: `${name}: ${act.toLowerCase()}`,
    },
  });

  revalidatePath("/admissions");
  revalidatePath(`/admissions/${applicationId}`);
  revalidatePath(`/students/${loaded.application.studentId}`);
  return { ok: true, message };
}
