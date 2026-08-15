"use server";

import { revalidatePath } from "next/cache";

import { generateReportCardRemark } from "@/lib/ai/insights";
import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateClassReportCards } from "@/lib/grading";
import { notifyUsers } from "@/lib/messaging";

export type GenerateState = {
  ok?: boolean;
  error?: string;
  generated?: number;
  skipped?: number;
  errors?: string[];
};

/**
 * Builds report cards for a whole class at once.
 *
 * Deliberately class-at-a-time rather than per student: positions, class
 * averages and subject highs only mean anything when every student in the
 * class is computed from the same set of marks.
 */
export async function generateReportCardsAction(
  _previous: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  try {
    await authorize("assessment.report.generate");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const classSectionId = String(formData.get("classSectionId") ?? "");
  const termId = String(formData.get("termId") ?? "");
  const gradeScaleId = String(formData.get("gradeScaleId") ?? "") || null;
  const overwrite = formData.get("overwrite") === "on";

  if (!classSectionId || !termId) {
    return { error: "Choose a class and a term." };
  }

  const result = await generateClassReportCards({
    classSectionId,
    termId,
    gradeScaleId,
    overwrite,
  });

  revalidatePath("/reports/cards");

  if (result.generated === 0 && result.errors.length) {
    return { error: result.errors[0], errors: result.errors };
  }

  return {
    ok: true,
    generated: result.generated,
    skipped: result.skipped,
    errors: result.errors,
  };
}

// -----------------------------------------------------------------------------
// Remarks
// -----------------------------------------------------------------------------

export type RemarkState = { ok?: boolean; error?: string };

export async function saveReportCardAction(
  _previous: RemarkState,
  formData: FormData,
): Promise<RemarkState> {
  let user;
  try {
    user = await authorize(["assessment.report.generate", "assessment.report.approve"]);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = String(formData.get("reportCardId") ?? "");
  if (!id) return { error: "Missing report card." };

  const existing = await db.reportCard.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!existing) return { error: "Report card not found." };
  if (existing.status === "PUBLISHED" && !user.permissions.has("assessment.report.approve")) {
    return { error: "This report card is published and can no longer be edited." };
  }

  const nextTermBegins = String(formData.get("nextTermBegins") ?? "");

  await db.reportCard.update({
    where: { id },
    data: {
      formTeacherRemark: String(formData.get("formTeacherRemark") ?? "") || null,
      headTeacherRemark: String(formData.get("headTeacherRemark") ?? "") || null,
      conduct: String(formData.get("conduct") ?? "") || null,
      attitude: String(formData.get("attitude") ?? "") || null,
      interest: String(formData.get("interest") ?? "") || null,
      activities: String(formData.get("activities") ?? "") || null,
      nextTermBegins: nextTermBegins ? new Date(nextTermBegins) : null,
    },
  });

  revalidatePath(`/reports/cards/${id}`);
  return { ok: true };
}

/** Drafts a remark with Claude for the teacher to edit. Never auto-applied. */
export async function draftRemarkAction(reportCardId: string) {
  await authorize("ai.insight.generate");
  await generateReportCardRemark(reportCardId);
  revalidatePath(`/reports/cards/${reportCardId}`);
}

// -----------------------------------------------------------------------------
// Approval and publishing
// -----------------------------------------------------------------------------

export async function approveReportCardAction(reportCardId: string) {
  const user = await authorize("assessment.report.approve");

  await db.reportCard.update({
    where: { id: reportCardId },
    data: {
      status: "APPROVED",
      approvedById: user.id,
      approvedAt: new Date(),
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "assessment.report.approve",
      entity: "ReportCard",
      entityId: reportCardId,
      summary: "Approved a report card",
    },
  });

  revalidatePath(`/reports/cards/${reportCardId}`);
  revalidatePath("/reports/cards");
}

/**
 * Publishes a class's report cards and tells the families.
 *
 * Publishing is the point at which results become visible in the portals, so
 * it is a single deliberate act per class rather than a side effect of
 * generating.
 */
export async function publishReportCardsAction(formData: FormData) {
  const user = await authorize("assessment.report.approve");

  const classSectionId = String(formData.get("classSectionId") ?? "");
  const termId = String(formData.get("termId") ?? "");
  if (!classSectionId || !termId) return { ok: false as const, error: "Missing class or term." };

  const cards = await db.reportCard.findMany({
    where: {
      classSectionId,
      termId,
      status: { in: ["DRAFT", "PENDING_REVIEW", "APPROVED"] },
    },
    select: {
      id: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
          user: { select: { id: true } },
          guardians: {
            where: { receivesReports: true },
            select: { guardian: { select: { user: { select: { id: true } } } } },
          },
        },
      },
      term: { select: { name: true } },
    },
  });

  if (!cards.length) {
    return { ok: false as const, error: "There are no report cards to publish." };
  }

  await db.reportCard.updateMany({
    where: { id: { in: cards.map((card) => card.id) } },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });

  // Notify each family about their own child, not the whole class.
  let notified = 0;
  for (const card of cards) {
    const recipients = new Set<string>();
    if (card.student.user?.id) recipients.add(card.student.user.id);
    for (const link of card.student.guardians) {
      if (link.guardian.user?.id) recipients.add(link.guardian.user.id);
    }
    if (!recipients.size) continue;

    await notifyUsers(Array.from(recipients), {
      title: `${card.term.name} report card available`,
      body: `The ${card.term.name} report card for ${card.student.firstName} ${card.student.lastName} is now available in your portal.`,
      category: "RESULT",
      url: `/reports/cards/${card.id}`,
    }).catch(() => undefined);

    notified += recipients.size;
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "assessment.report.publish",
      entity: "ClassSection",
      entityId: classSectionId,
      summary: `Published ${cards.length} report cards, notified ${notified} people`,
    },
  });

  revalidatePath("/reports/cards");
  return { ok: true as const, published: cards.length, notified };
}
