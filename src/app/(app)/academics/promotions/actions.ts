"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";

export type PromotionState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

/**
 * Moves one class into the next academic year.
 *
 * This is how the system survives September: without it every student stays
 * enrolled in last year's class forever. One section at a time, deliberately —
 * promotion is a decision a head teacher takes class by class with the form
 * teacher's input, not a school-wide button, and a mistake scoped to one
 * class is a mistake that can be reasoned about.
 *
 * Per student, one of three decisions:
 *  - PROMOTED  → old enrolment COMPLETED, new enrolment in the target section
 *  - REPEATED  → old enrolment REPEATED, new enrolment in the repeat section
 *                (same level, chosen on the form)
 *  - GRADUATED → old enrolment COMPLETED, student status GRADUATED, no new
 *                enrolment — they have left through the front door
 *
 * Every decision writes a PromotionRecord, because "why is this child in JHS 2
 * twice" is a question someone asks years later, of a file, not a person.
 *
 * Re-running is safe: a student who already has an enrolment in the target
 * year is skipped and reported, not double-enrolled — the unique constraint
 * on (studentId, academicYearId) is the backstop, and the skip is the polite
 * version of hitting it.
 */
export async function promoteClassAction(
  _previous: PromotionState,
  formData: FormData,
): Promise<PromotionState> {
  let user;
  try {
    user = await authorize("student.promote");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const fromSectionId = String(formData.get("fromSectionId") ?? "");
  const fromYearId = String(formData.get("fromYearId") ?? "");
  const toYearId = String(formData.get("toYearId") ?? "");
  const toSectionId = String(formData.get("toSectionId") ?? "");
  const repeatSectionId = String(formData.get("repeatSectionId") ?? "") || fromSectionId;
  const graduating = formData.get("graduating") === "on";

  if (!fromSectionId || !fromYearId || !toYearId) {
    return { error: "Choose the class and both academic years." };
  }
  if (toYearId === fromYearId) {
    return { error: "Promotion moves students into a different academic year." };
  }
  if (!graduating && !toSectionId) {
    return { error: "Choose the class they move into, or mark the class as graduating." };
  }

  // decisions arrive as "<studentId>:<PROMOTED|REPEATED|GRADUATED>"
  const decisions = new Map<string, string>();
  for (const entry of formData.getAll("decisions").map(String)) {
    const [studentId, decision] = entry.split(":");
    if (studentId && ["PROMOTED", "REPEATED", "GRADUATED"].includes(decision)) {
      decisions.set(studentId, decision);
    }
  }
  if (!decisions.size) return { error: "No students to move." };

  const enrollments = await db.enrollment.findMany({
    where: {
      classSectionId: fromSectionId,
      academicYearId: fromYearId,
      status: "ACTIVE",
      studentId: { in: [...decisions.keys()] },
    },
    select: {
      id: true,
      studentId: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  // Averages from the latest published report card, carried onto the record
  // so the decision's evidence travels with it.
  const cards = await db.reportCard.findMany({
    where: {
      studentId: { in: enrollments.map((enrollment) => enrollment.studentId) },
      academicYearId: fromYearId,
      status: "PUBLISHED",
    },
    orderBy: { createdAt: "desc" },
    select: { studentId: true, averageScore: true },
  });
  const averageOf = new Map<string, unknown>();
  for (const card of cards) {
    if (!averageOf.has(card.studentId)) averageOf.set(card.studentId, card.averageScore);
  }

  let moved = 0;
  let repeated = 0;
  let graduated = 0;
  const skipped: string[] = [];

  for (const enrollment of enrollments) {
    const decision = graduating ? "GRADUATED" : decisions.get(enrollment.studentId)!;
    const targetSection = decision === "REPEATED" ? repeatSectionId : toSectionId;

    if (decision !== "GRADUATED") {
      const existing = await db.enrollment.findUnique({
        where: {
          studentId_academicYearId: {
            studentId: enrollment.studentId,
            academicYearId: toYearId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        skipped.push(`${enrollment.student.firstName} ${enrollment.student.lastName}`);
        continue;
      }
    }

    await db.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: decision === "REPEATED" ? "REPEATED" : "COMPLETED",
          endedOn: new Date(),
        },
      });

      if (decision === "GRADUATED") {
        await tx.student.update({
          where: { id: enrollment.studentId },
          data: { status: "GRADUATED", exitDate: new Date() },
        });
      } else {
        await tx.enrollment.create({
          data: {
            studentId: enrollment.studentId,
            classSectionId: targetSection,
            academicYearId: toYearId,
            status: "ACTIVE",
          },
        });
      }

      await tx.promotionRecord.create({
        data: {
          studentId: enrollment.studentId,
          academicYearId: fromYearId,
          fromSectionId,
          toSectionId: decision === "GRADUATED" ? null : targetSection,
          decision,
          averageScore: (averageOf.get(enrollment.studentId) as never) ?? null,
          decidedBy: user.fullName,
        },
      });
    });

    if (decision === "GRADUATED") graduated += 1;
    else if (decision === "REPEATED") repeated += 1;
    else moved += 1;
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "student.promote",
      entity: "ClassSection",
      entityId: fromSectionId,
      summary: `Promotion run: ${moved} promoted, ${repeated} repeating, ${graduated} graduated${
        skipped.length ? `, ${skipped.length} already placed` : ""
      }`,
    },
  });

  revalidatePath("/academics/promotions");
  revalidatePath("/students");

  const parts = [
    moved ? `${moved} promoted` : null,
    repeated ? `${repeated} repeating` : null,
    graduated ? `${graduated} graduated` : null,
    skipped.length
      ? `${skipped.length} already had a place in the new year (${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""})`
      : null,
  ].filter(Boolean);

  return { ok: true, message: parts.join(" · ") || "Nothing needed doing." };
}
