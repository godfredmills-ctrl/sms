import "server-only";

import { db } from "@/lib/db";
import { userCan, type AuthUser } from "@/lib/auth";

/**
 * Who may see a credential.
 *
 * Three routes to the same document, and they are genuinely different rights:
 *
 * - Staff hold the issuing permission, so they can read any of them.
 * - The student it names can read their own. A certificate about you is yours.
 * - A guardian can read it for a child they are listed against **and marked as
 *   a recipient of reports for**. That flag is the school's record of who is
 *   entitled to academic information about the child, and a certificate is
 *   academic information. A parent on the contact list without that flag can
 *   still be reached in an emergency without being handed the results.
 *
 * Returning the reason rather than a boolean lets the caller answer 403 with
 * something the person can act on.
 */
export type CredentialAccess =
  | { allowed: true; via: "staff" | "self" | "guardian" }
  | { allowed: false; reason: string };

export async function canAccessCredential(
  user: AuthUser,
  kind: "certificate" | "transcript",
  studentId: string | null,
): Promise<CredentialAccess> {
  const permission =
    kind === "transcript"
      ? "assessment.transcript.generate"
      : "assessment.certificate.issue";

  if (userCan(user, permission)) return { allowed: true, via: "staff" };

  if (!studentId) {
    // A certificate awarded to somebody with no student record — an external
    // participant, a staff award — has no family to fall back to.
    return {
      allowed: false,
      reason: "This document is not linked to a student record.",
    };
  }

  if (user.studentId && user.studentId === studentId) {
    return { allowed: true, via: "self" };
  }

  if (user.guardianId) {
    const link = await db.studentGuardian.findUnique({
      where: {
        studentId_guardianId: { studentId, guardianId: user.guardianId },
      },
      select: { receivesReports: true },
    });

    if (link?.receivesReports) return { allowed: true, via: "guardian" };
    if (link) {
      return {
        allowed: false,
        reason:
          "Your record is not marked as a recipient of academic reports for this student. The school office can change that.",
      };
    }
  }

  return { allowed: false, reason: "This document is not yours to view." };
}

/** Every credential a family may see for a given set of students. */
export async function credentialsForStudents(studentIds: string[]) {
  if (!studentIds.length) return { certificates: [], transcripts: [] };

  const [certificates, transcripts] = await Promise.all([
    db.issuedCertificate.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { issuedOn: "desc" },
      select: {
        id: true,
        serialNumber: true,
        title: true,
        kind: true,
        awardedFor: true,
        issuedOn: true,
        verifyCode: true,
        revokedAt: true,
        revokeReason: true,
        student: {
          select: { id: true, firstName: true, lastName: true, otherNames: true },
        },
      },
    }),
    db.transcript.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        serialNumber: true,
        purpose: true,
        issuedTo: true,
        issuedAt: true,
        verifyCode: true,
        cumulativeGpa: true,
        classification: true,
        revokedAt: true,
        revokeReason: true,
        student: {
          select: { id: true, firstName: true, lastName: true, otherNames: true },
        },
      },
    }),
  ]);

  return { certificates, transcripts };
}
