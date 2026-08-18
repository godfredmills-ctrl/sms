"use server";

import { revalidatePath } from "next/cache";

import { generateReportCardRemark } from "@/lib/ai/insights";
import { authorize } from "@/lib/auth";
import { reportCardOutOfScope, sectionOutOfScope } from "@/lib/scope";
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
  let user;
  try {
    user = await authorize("assessment.report.generate");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const classSectionId = String(formData.get("classSectionId") ?? "");
  // The picker narrows to the teacher's own classes, but a picker is client
  // input: generating rebuilds every card in the class, resets them to
  // draft, and recomputes positions — for whichever class was posted.
  const outOfScope = await sectionOutOfScope(user, classSectionId);
  if (outOfScope) return { error: outOfScope };
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
  // Remarks and conduct are written about a child by the person who teaches
  // them, not by anyone holding the permission to write remarks somewhere.
  const cardOutOfScope = await reportCardOutOfScope(user, id);
  if (cardOutOfScope) return { error: cardOutOfScope };
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
  const user = await authorize("ai.insight.generate");

  // Drafting a remark reads the child's marks, attendance and conduct.
  const outOfScope = await reportCardOutOfScope(user, reportCardId);
  if (outOfScope) return { error: outOfScope };
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
export type EmailCardsState = {
  ok?: boolean;
  error?: string;
  message?: string;
  sent?: number;
  skipped?: string[];
};

/**
 * Emails a class's published report cards home, each as its own PDF.
 *
 * Sent one family at a time rather than as a bulk mailshot with everything
 * attached — the whole point is that a parent receives their own child's
 * report and nobody else's. Only published cards go out, and only to guardians
 * flagged as recipients of academic reports, so the email route grants nothing
 * the portal would refuse.
 */
export async function emailReportCardsAction(
  _previous: EmailCardsState,
  formData: FormData,
): Promise<EmailCardsState> {
  let user;
  try {
    user = await authorize("assessment.report.approve");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const classSectionId = String(formData.get("classSectionId") ?? "");
  // The picker narrows to the teacher's own classes, but a picker is client
  // input: generating rebuilds every card in the class, resets them to
  // draft, and recomputes positions — for whichever class was posted.
  const outOfScope = await sectionOutOfScope(user, classSectionId);
  if (outOfScope) return { error: outOfScope };
  const termId = String(formData.get("termId") ?? "");
  if (!classSectionId || !termId) return { error: "Choose a class and a term." };

  const { buildReportCardPdf } = await import("@/lib/report-card-pdf");
  const { sendEmail } = await import("@/lib/messaging/providers");

  const cards = await db.reportCard.findMany({
    where: { classSectionId, termId, status: "PUBLISHED" },
    select: {
      id: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNo: true,
          guardians: {
            where: { receivesReports: true },
            select: { guardian: { select: { firstName: true, email: true } } },
          },
        },
      },
      term: { select: { name: true } },
      academicYear: { select: { name: true } },
    },
  });

  if (!cards.length) {
    return {
      error:
        "No published report cards for that class and term. Publish them first — a draft is not something to email home.",
    };
  }

  let sent = 0;
  const skipped: string[] = [];

  for (const card of cards) {
    const addresses = card.student.guardians
      .map((link) => link.guardian)
      .filter((guardian): guardian is { firstName: string; email: string } =>
        Boolean(guardian.email),
      );

    if (!addresses.length) {
      skipped.push(`${card.student.firstName} ${card.student.lastName} — no email`);
      continue;
    }

    let pdf: Buffer | null;
    try {
      pdf = await buildReportCardPdf(card.id);
    } catch {
      pdf = null;
    }

    if (!pdf) {
      skipped.push(`${card.student.firstName} ${card.student.lastName} — render failed`);
      continue;
    }

    for (const guardian of addresses) {
      const result = await sendEmail({
        to: guardian.email,
        subject: `${card.term.name} report card — ${card.student.firstName} ${card.student.lastName}`,
        html: `<p>Dear ${guardian.firstName},</p>
<p>Please find attached the ${card.term.name} report card for ${card.student.firstName} ${card.student.lastName} (${card.student.admissionNo}), ${card.academicYear.name}.</p>
<p>You can also view it any time in the parent portal.</p>`,
        attachments: [
          {
            filename: `${card.student.admissionNo.replace(/\//g, "-")}-${card.term.name
              .toLowerCase()
              .replace(/\s+/g, "-")}.pdf`,
            content: pdf,
            contentType: "application/pdf",
          },
        ],
      });
      if (result.ok) sent += 1;
    }
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "assessment.report.email",
      summary: `Emailed ${cards.length} report cards to ${sent} guardian(s)`,
    },
  });

  return {
    ok: true,
    sent,
    skipped: skipped.slice(0, 20),
    message: `Sent ${sent} email${sent === 1 ? "" : "s"} across ${cards.length} report card${
      cards.length === 1 ? "" : "s"
    }.`,
  };
}

export async function publishReportCardsAction(formData: FormData) {
  const user = await authorize("assessment.report.approve");

  const classSectionId = String(formData.get("classSectionId") ?? "");
  // The picker narrows to the teacher's own classes, but a picker is client
  // input: generating rebuilds every card in the class, resets them to
  // draft, and recomputes positions — for whichever class was posted.
  const outOfScope = await sectionOutOfScope(user, classSectionId);
  if (outOfScope) return { error: outOfScope };
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
