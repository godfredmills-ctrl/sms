"use server";

import { revalidatePath } from "next/cache";
import type { AssessmentCategory } from "@prisma/client";

import { generateTeachingInsight } from "@/lib/ai/insights";
import { authorize } from "@/lib/auth";
import { assessmentOutOfScope, offeringOutOfScope } from "@/lib/scope";
import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/messaging";

export type ScoreEntry = {
  studentId: string;
  assessmentId: string;
  /** null clears the mark; `isAbsent` records a sat-but-absent student. */
  score: number | null;
  isAbsent: boolean;
};

export type SaveScoresResult =
  | { ok: true; saved: number; cleared: number }
  | { ok: false; error: string };

/**
 * Saves a whole mark sheet in one transaction.
 *
 * Teachers edit a grid and press save once, so a partial write would leave a
 * class half-marked with no indication of which half.
 */
export async function saveScores(
  offeringId: string,
  entries: ScoreEntry[],
): Promise<SaveScoresResult> {
  const user = await authorize("assessment.grade");

  const offering = await db.subjectOffering.findUnique({
    where: { id: offeringId },
    select: {
      teacherId: true,
      term: { select: { isLocked: true } },
      assessments: { select: { id: true, maxScore: true, isLocked: true, title: true } },
    },
  });

  if (!offering) return { ok: false, error: "Subject offering not found." };
  if (offering.term?.isLocked) {
    return { ok: false, error: "This term is locked. Ask an administrator to reopen it." };
  }

  // A teacher may only mark their own class unless they can grade school-wide.
  const isOwner = offering.teacherId && offering.teacherId === user.staffId;
  if (!isOwner && !user.permissions.has("assessment.publish")) {
    return { ok: false, error: "You can only enter marks for your own classes." };
  }

  const byId = new Map(offering.assessments.map((entry) => [entry.id, entry]));

  // Validate everything before writing anything.
  for (const entry of entries) {
    const assessment = byId.get(entry.assessmentId);
    if (!assessment) {
      return { ok: false, error: "A mark was submitted for an unknown assessment." };
    }
    if (assessment.isLocked) {
      return { ok: false, error: `"${assessment.title}" is locked and cannot be changed.` };
    }
    if (entry.score !== null) {
      const max = Number(assessment.maxScore);
      if (!Number.isFinite(entry.score) || entry.score < 0 || entry.score > max) {
        return {
          ok: false,
          error: `A mark of ${entry.score} is outside the range 0–${max} for "${assessment.title}".`,
        };
      }
    }
  }

  const toWrite = entries.filter((entry) => entry.score !== null || entry.isAbsent);
  const toClear = entries.filter((entry) => entry.score === null && !entry.isAbsent);

  try {
    await db.$transaction([
      ...toWrite.map((entry) =>
        db.assessmentScore.upsert({
          where: {
            assessmentId_studentId: {
              assessmentId: entry.assessmentId,
              studentId: entry.studentId,
            },
          },
          create: {
            assessmentId: entry.assessmentId,
            studentId: entry.studentId,
            score: entry.isAbsent ? null : entry.score,
            isAbsent: entry.isAbsent,
            gradedById: user.staffId,
          },
          update: {
            score: entry.isAbsent ? null : entry.score,
            isAbsent: entry.isAbsent,
            gradedById: user.staffId,
          },
        }),
      ),
      // A blanked cell means "not marked yet", which is different from zero.
      ...toClear.map((entry) =>
        db.assessmentScore.deleteMany({
          where: { assessmentId: entry.assessmentId, studentId: entry.studentId },
        }),
      ),
    ]);

    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: "assessment.grade",
        entity: "SubjectOffering",
        entityId: offeringId,
        summary: `Saved ${toWrite.length} marks`,
      },
    });

    revalidatePath(`/gradebook/${offeringId}`);
    return { ok: true, saved: toWrite.length, cleared: toClear.length };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

// -----------------------------------------------------------------------------
// Assessments
// -----------------------------------------------------------------------------

export type AssessmentFormState = { ok?: boolean; error?: string };

export async function createAssessment(
  _previous: AssessmentFormState,
  formData: FormData,
): Promise<AssessmentFormState> {
  let user;
  try {
    user = await authorize("assessment.create");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const offeringId = String(formData.get("offeringId") ?? "");
  // The offering id comes off the form. Without this, a teacher sets a test
  // for a class they have nothing to do with.
  const outOfScope = await offeringOutOfScope(user, offeringId);
  if (outOfScope) return { error: outOfScope };
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "TEST") as AssessmentCategory;
  const maxScore = Number(formData.get("maxScore") ?? 100);
  const weight = Number(formData.get("weight") ?? 0);
  const isExam = formData.get("isExam") === "on";
  const conductedOn = String(formData.get("conductedOn") ?? "");

  if (!title) return { error: "Give the assessment a title." };
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return { error: "Maximum score must be greater than zero." };
  }
  if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
    return { error: "Weight must be between 0 and 100." };
  }

  const offering = await db.subjectOffering.findUnique({
    where: { id: offeringId },
    select: {
      termId: true,
      teacherId: true,
      assessments: { select: { weight: true } },
    },
  });

  if (!offering?.termId) return { error: "Subject offering not found." };

  // The weights of all components decide the final subject mark, so they must
  // not exceed 100 between them.
  const usedWeight = offering.assessments.reduce(
    (sum, entry) => sum + Number(entry.weight),
    0,
  );
  if (usedWeight + weight > 100) {
    return {
      error: `Weights would total ${usedWeight + weight}%. Only ${100 - usedWeight}% is left for this subject.`,
    };
  }

  await db.assessment.create({
    data: {
      offeringId,
      termId: offering.termId,
      title,
      category,
      maxScore,
      weight,
      isExam,
      conductedOn: conductedOn ? new Date(conductedOn) : null,
      createdById: user.id,
    },
  });

  revalidatePath(`/gradebook/${offeringId}`);
  return { ok: true };
}

/** Publishing makes the marks visible in the student and guardian portals. */
/**
 * Publishes marks to the student and guardian portals.
 *
 * Two separate things had to be true and neither was checked. The gate was
 * an any-of pair, so `assessment.grade` — which every teacher holds —
 * satisfied it and the `assessment.publish` half never bit. And the action
 * updated by id without ever asking whose assessment it was, so any teacher
 * could push another class's marks live and notify every family.
 */
export async function publishAssessment(assessmentId: string) {
  const user = await authorize("assessment.grade");

  const outOfScope = await assessmentOutOfScope(user, assessmentId);
  if (outOfScope) return { error: outOfScope };

  // Publishing is the moment marks reach families, and it is not undoable
  // through this app: it belongs to whoever holds the publish permission.
  if (!user.permissions.has("assessment.publish")) {
    return { error: "Publishing results needs the exams officer or the head." };
  }

  const assessment = await db.assessment.update({
    where: { id: assessmentId },
    data: { isPublished: true, publishedAt: new Date() },
    select: {
      title: true,
      offeringId: true,
      offering: {
        select: {
          subject: { select: { name: true } },
          classSection: {
            select: {
              enrollments: {
                where: { status: "ACTIVE" },
                select: {
                  student: {
                    select: {
                      user: { select: { id: true } },
                      guardians: {
                        where: { receivesReports: true },
                        select: {
                          guardian: { select: { user: { select: { id: true } } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const recipients = new Set<string>();
  for (const enrolment of assessment.offering.classSection.enrollments) {
    if (enrolment.student.user?.id) recipients.add(enrolment.student.user.id);
    for (const link of enrolment.student.guardians) {
      if (link.guardian.user?.id) recipients.add(link.guardian.user.id);
    }
  }

  if (recipients.size) {
    await notifyUsers(Array.from(recipients), {
      title: `${assessment.offering.subject.name} results published`,
      body: `Marks for "${assessment.title}" are now available.`,
      category: "RESULT",
      url: "/portal/student/results",
    }).catch(() => undefined);
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "assessment.publish",
      entity: "Assessment",
      entityId: assessmentId,
      summary: `Published "${assessment.title}" to ${recipients.size} recipients`,
    },
  });

  revalidatePath(`/gradebook/${assessment.offeringId}`);
  return { ok: true as const, notified: recipients.size };
}

export async function deleteAssessment(assessmentId: string) {
  const user = await authorize("assessment.create");

  // Deleting an assessment takes its marks with it.
  const outOfScope = await assessmentOutOfScope(user, assessmentId);
  if (outOfScope) return { error: outOfScope };

  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: { offeringId: true, isPublished: true, _count: { select: { scores: true } } },
  });

  if (!assessment) return { ok: false as const, error: "Assessment not found." };
  if (assessment.isPublished) {
    return {
      ok: false as const,
      error: "Published assessments cannot be deleted. Unpublish it first.",
    };
  }

  await db.assessment.delete({ where: { id: assessmentId } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "assessment.delete",
      entity: "Assessment",
      entityId: assessmentId,
      summary: `Deleted an assessment with ${assessment._count.scores} marks`,
    },
  });

  revalidatePath(`/gradebook/${assessment.offeringId}`);
  return { ok: true as const };
}

// -----------------------------------------------------------------------------
// AI
// -----------------------------------------------------------------------------

export async function generateTeachingInsightAction(termId: string) {
  const user = await authorize("ai.insight.generate");
  if (!user.staffId) return;
  await generateTeachingInsight(user.staffId, termId, user.id);
  revalidatePath("/gradebook");
}
