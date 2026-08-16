"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { generateCode } from "@/lib/crypto";
import { db } from "@/lib/db";
import { buildTranscriptData } from "@/lib/grading";

export type CredentialState = {
  ok?: boolean;
  error?: string;
  id?: string;
  message?: string;
};

/**
 * Issues a transcript.
 *
 * The academic record is frozen into `snapshot` at issue time and never
 * recomputed. A transcript is a statement about what the school certified on
 * a given date — if a mark is later corrected, the old document must still
 * say what it said, and a new one is issued instead.
 */
export async function issueTranscriptAction(
  _previous: CredentialState,
  formData: FormData,
): Promise<CredentialState> {
  let user;
  try {
    user = await authorize("assessment.transcript.generate");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) return { error: "Choose a student." };

  const data = await buildTranscriptData(studentId);
  if (!data) return { error: "Student not found." };
  if (!data.terms.length) {
    return {
      error:
        "This student has no approved or published report cards, so there is nothing to certify.",
    };
  }

  const year = new Date().getFullYear();
  const count = await db.transcript.count();

  // The chosen template is validated rather than trusted: a stale id, or one
  // for a certificate, would otherwise be saved and then silently ignored at
  // render time — which is exactly how a template comes to look broken.
  const requestedTemplateId = String(formData.get("templateId") ?? "").trim();
  const template = requestedTemplateId
    ? await db.documentTemplate.findFirst({
        where: { id: requestedTemplateId, kind: "TRANSCRIPT", isActive: true },
        select: { id: true },
      })
    : await db.documentTemplate.findFirst({
        where: { kind: "TRANSCRIPT", isActive: true, isDefault: true },
        select: { id: true },
      });

  const transcript = await db.transcript.create({
    data: {
      studentId,
      templateId: template?.id ?? null,
      serialNumber: `TR/${year}/${String(count + 1).padStart(4, "0")}`,
      verifyCode: generateCode(10),
      purpose: String(formData.get("purpose") ?? "") || null,
      issuedTo: String(formData.get("issuedTo") ?? "") || null,
      isOfficial: formData.get("isOfficial") === "on",
      snapshot: data as never,
      cumulativeGpa: data.cumulativeGpa,
      totalCredits: data.totalCredits,
      issuedById: user.id,
      lines: {
        create: data.terms.flatMap((term, termIndex) =>
          term.lines.map((line, lineIndex) => ({
            subjectId: line.subjectId,
            academicYear: term.academicYear,
            termName: term.termName,
            subjectName: line.subjectName,
            score: line.score,
            grade: line.grade,
            point: line.point,
            credits: line.credits,
            remark: line.remark,
            sortKey: termIndex * 100 + lineIndex,
          })),
        ),
      },
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "assessment.transcript.generate",
      entity: "Transcript",
      entityId: transcript.id,
      summary: `Issued transcript ${transcript.serialNumber}`,
    },
  });

  revalidatePath("/credentials");
  return { ok: true, id: transcript.id };
}

export async function issueCertificateAction(
  _previous: CredentialState,
  formData: FormData,
): Promise<CredentialState> {
  let user;
  try {
    user = await authorize("assessment.certificate.issue");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const templateId = String(formData.get("templateId") ?? "");
  const studentId = String(formData.get("studentId") ?? "") || null;
  const title = String(formData.get("title") ?? "").trim();
  const recipientName = String(formData.get("recipientName") ?? "").trim();

  if (!templateId) return { error: "Choose a certificate template." };
  if (!title) return { error: "Give the certificate a title." };

  // A named recipient is required; a student link is optional so awards can go
  // to staff or external participants too.
  let name = recipientName;
  if (!name && studentId) {
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { firstName: true, otherNames: true, lastName: true },
    });
    name = [student?.firstName, student?.otherNames, student?.lastName]
      .filter(Boolean)
      .join(" ");
  }
  if (!name) return { error: "Choose a student or type a recipient name." };

  const year = new Date().getFullYear();
  const count = await db.issuedCertificate.count();

  const certificate = await db.issuedCertificate.create({
    data: {
      templateId,
      studentId,
      serialNumber: `CERT/${year}/${String(count + 1).padStart(4, "0")}`,
      verifyCode: generateCode(10),
      kind: String(formData.get("kind") ?? "COMPLETION"),
      title,
      recipientName: name,
      awardedFor: String(formData.get("awardedFor") ?? "") || null,
      signedBy: String(formData.get("signedBy") ?? "") || null,
      signatoryTitle: String(formData.get("signatoryTitle") ?? "") || null,
      issuedById: user.id,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "assessment.certificate.issue",
      entity: "IssuedCertificate",
      entityId: certificate.id,
      summary: `Issued ${certificate.serialNumber} to ${name}`,
    },
  });

  revalidatePath("/credentials");
  return { ok: true, id: certificate.id };
}

/**
 * Emails a credential to the family as a PDF attachment.
 *
 * Sent to guardians flagged as recipients of reports, which is the school's
 * own record of who is entitled to academic information about the child — the
 * same rule the portal uses, so a document cannot reach someone by email that
 * they would be refused on screen.
 */
export async function emailCredentialAction(
  _previous: CredentialState,
  formData: FormData,
): Promise<CredentialState> {
  let user;
  try {
    user = await authorize([
      "assessment.certificate.issue",
      "assessment.transcript.generate",
    ]);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id || (kind !== "certificate" && kind !== "transcript")) {
    return { error: "Missing document." };
  }

  const { db: prisma } = await import("@/lib/db");
  const { renderCredentialPdf } = await import("@/lib/credential-pdf");
  const { sendEmail } = await import("@/lib/messaging/providers");

  const record =
    kind === "certificate"
      ? await prisma.issuedCertificate.findUnique({
          where: { id },
          select: {
            studentId: true,
            serialNumber: true,
            title: true,
            revokedAt: true,
          },
        })
      : await prisma.transcript.findUnique({
          where: { id },
          select: {
            studentId: true,
            serialNumber: true,
            purpose: true,
            revokedAt: true,
          },
        });

  if (!record) return { error: "That document no longer exists." };
  if (record.revokedAt) {
    return { error: "That document has been withdrawn and cannot be sent." };
  }
  if (!record.studentId) {
    return {
      error: "This document is not linked to a student, so there is no family to send it to.",
    };
  }

  const recipients = await prisma.studentGuardian.findMany({
    where: { studentId: record.studentId, receivesReports: true },
    select: { guardian: { select: { firstName: true, email: true } } },
  });

  const addresses = recipients
    .map((link) => link.guardian)
    .filter((guardian): guardian is { firstName: string; email: string } =>
      Boolean(guardian.email),
    );

  if (!addresses.length) {
    return {
      error:
        "No guardian on this student's record has both an email address and permission to receive reports.",
    };
  }

  let pdf: Buffer;
  try {
    pdf = await renderCredentialPdf(kind, id);
  } catch (error) {
    return { error: `Could not produce the PDF: ${(error as Error).message}` };
  }

  const label =
    kind === "certificate"
      ? ((record as { title: string }).title ?? "Certificate")
      : `Academic transcript`;

  let sent = 0;
  for (const guardian of addresses) {
    const result = await sendEmail({
      to: guardian.email,
      subject: `${label} — ${record.serialNumber}`,
      html: `<p>Dear ${guardian.firstName},</p>
<p>Please find attached the ${label.toLowerCase()} issued by the school, reference ${record.serialNumber}.</p>
<p>The document carries a verification code so that any university or employer receiving it can confirm it is genuine.</p>`,
      attachments: [
        {
          filename: `${record.serialNumber.replace(/\//g, "-")}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
    if (result.ok) sent += 1;
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: `assessment.${kind}.email`,
      entity: kind === "certificate" ? "IssuedCertificate" : "Transcript",
      entityId: id,
      summary: `Emailed ${record.serialNumber} to ${sent} guardian(s)`,
    },
  });

  revalidatePath("/credentials");

  return sent
    ? { ok: true, message: `Sent to ${sent} guardian${sent === 1 ? "" : "s"}.` }
    : { error: "The email provider rejected every address." };
}

/**
 * Revocation rather than deletion.
 *
 * A certificate that has left the building may already be in someone's file,
 * so the verification page has to be able to say "this was withdrawn" rather
 * than "no such document".
 */
export async function revokeCredentialAction(formData: FormData) {
  const user = await authorize([
    "assessment.certificate.issue",
    "assessment.transcript.generate",
  ]);

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "") || "Withdrawn by the school";

  if (kind === "transcript") {
    await db.transcript.update({
      where: { id },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  } else {
    await db.issuedCertificate.update({
      where: { id },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "credential.revoke",
      entity: kind,
      entityId: id,
      summary: reason,
    },
  });

  revalidatePath("/credentials");
}

/** Creates a certificate template that certificates are issued against. */
export async function createTemplateAction(formData: FormData) {
  const user = await authorize("assessment.template.manage");

  await db.documentTemplate.create({
    data: {
      name: String(formData.get("name") ?? "Untitled template"),
      kind: String(formData.get("kind") ?? "CERTIFICATE"),
      description: String(formData.get("description") ?? "") || null,
      source: "BUILDER",
      orientation: String(formData.get("orientation") ?? "LANDSCAPE"),
      isDefault: formData.get("isDefault") === "on",
      layout: {
        border: String(formData.get("border") ?? "classic"),
        accent: String(formData.get("accent") ?? "#128257"),
      },
      createdById: user.id,
    },
  });

  revalidatePath("/credentials");
}
