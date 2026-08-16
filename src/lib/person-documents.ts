import "server-only";

import { db } from "@/lib/db";
import { previewKindFor, type PreviewKind } from "@/lib/storage";

/**
 * Documents held on a person's file — student, staff or guardian.
 *
 * The three tables are separate so each can carry a real foreign key, but the
 * shape is identical, so everything above this line works from one type and
 * one component.
 */

export type PersonKind = "student" | "staff" | "guardian";

/** Verification and expiry collapsed into the one thing an office needs to see. */
export type DocumentStatus =
  | "verified"
  | "pending"
  | "expiring"
  | "expired"
  | "rejected";

export type PersonDocument = {
  id: string;
  title: string;
  category: string;
  notes: string | null;
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewKind: PreviewKind;
  uploadedAt: string;
  uploadedBy: string | null;
  expiresAt: string | null;
  isVerified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  status: DocumentStatus;
  /** Days until expiry; negative once past. Null when it never expires. */
  daysToExpiry: number | null;
};

/** Categories offered per person type, so the dropdown is never generic. */
export const DOCUMENT_CATEGORIES: Record<
  PersonKind,
  Array<{ value: string; label: string; expires?: boolean }>
> = {
  student: [
    { value: "BIRTH_CERTIFICATE", label: "Birth certificate" },
    { value: "PASSPORT", label: "Passport", expires: true },
    { value: "GHANA_CARD", label: "Ghana Card", expires: true },
    { value: "PHOTO", label: "Passport photograph" },
    { value: "IMMUNISATION", label: "Immunisation record" },
    { value: "MEDICAL", label: "Medical report" },
    { value: "TRANSFER_LETTER", label: "Transfer letter" },
    { value: "PREVIOUS_REPORT", label: "Previous school report" },
    { value: "GUARDIAN_ID", label: "Guardian identification" },
    { value: "OTHER", label: "Other" },
  ],
  staff: [
    { value: "CONTRACT", label: "Employment contract", expires: true },
    { value: "CERTIFICATE", label: "Academic certificate" },
    { value: "GHANA_CARD", label: "Ghana Card", expires: true },
    { value: "SSNIT", label: "SSNIT card" },
    { value: "CV", label: "Curriculum vitae" },
    { value: "REFERENCE", label: "Reference letter" },
    { value: "POLICE_CHECK", label: "Police clearance", expires: true },
    { value: "MEDICAL", label: "Medical certificate", expires: true },
    { value: "TEACHING_LICENCE", label: "Teaching licence", expires: true },
    { value: "OTHER", label: "Other" },
  ],
  guardian: [
    { value: "GHANA_CARD", label: "Ghana Card", expires: true },
    { value: "PASSPORT", label: "Passport", expires: true },
    { value: "PROOF_OF_ADDRESS", label: "Proof of address" },
    { value: "CUSTODY_ORDER", label: "Custody order" },
    { value: "EMPLOYMENT_LETTER", label: "Employment letter" },
    { value: "OTHER", label: "Other" },
  ],
};

/** Within this many days, an expiry is worth chasing rather than just noting. */
const EXPIRY_WARNING_DAYS = 60;

function statusOf(row: {
  isVerified: boolean;
  expiresAt: Date | null;
}): { status: DocumentStatus; daysToExpiry: number | null } {
  if (!row.expiresAt) {
    return { status: row.isVerified ? "verified" : "pending", daysToExpiry: null };
  }

  const days = Math.ceil(
    (row.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );

  // Expiry outranks verification. A verified passport that expired last month
  // is not a valid document, and showing it as "Verified" is the failure this
  // whole panel exists to prevent.
  if (days < 0) return { status: "expired", daysToExpiry: days };
  if (days <= EXPIRY_WARNING_DAYS) return { status: "expiring", daysToExpiry: days };

  return { status: row.isVerified ? "verified" : "pending", daysToExpiry: days };
}

type RawDocument = {
  id: string;
  title: string;
  category: string;
  notes: string | null;
  fileId: string;
  expiresAt: Date | null;
  isVerified: boolean;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  uploadedAt: Date;
  file: { originalName: string; mimeType: string; sizeBytes: number };
};

function shape(row: RawDocument, uploadedBy: string | null): PersonDocument {
  const { status, daysToExpiry } = statusOf(row);

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    notes: row.notes,
    fileId: row.fileId,
    fileName: row.file.originalName,
    mimeType: row.file.mimeType,
    sizeBytes: row.file.sizeBytes,
    previewKind: previewKindFor(row.file.mimeType),
    uploadedAt: row.uploadedAt.toISOString(),
    uploadedBy,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    isVerified: row.isVerified,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    status,
    daysToExpiry,
  };
}

const SELECT = {
  id: true,
  title: true,
  category: true,
  notes: true,
  fileId: true,
  expiresAt: true,
  isVerified: true,
  verifiedBy: true,
  verifiedAt: true,
  uploadedAt: true,
  uploadedById: true,
  file: { select: { originalName: true, mimeType: true, sizeBytes: true } },
} as const;

export async function documentsFor(
  kind: PersonKind,
  personId: string,
): Promise<PersonDocument[]> {
  const rows =
    kind === "student"
      ? await db.studentDocument.findMany({
          where: { studentId: personId },
          orderBy: { uploadedAt: "desc" },
          select: SELECT,
        })
      : kind === "staff"
        ? await db.staffDocument.findMany({
            where: { staffId: personId },
            orderBy: { uploadedAt: "desc" },
            select: SELECT,
          })
        : await db.guardianDocument.findMany({
            where: { guardianId: personId },
            orderBy: { uploadedAt: "desc" },
            select: SELECT,
          });

  // Uploader names in one query rather than a join per row.
  const uploaderIds = [
    ...new Set(rows.map((row) => row.uploadedById).filter(Boolean)),
  ] as string[];

  const uploaders = uploaderIds.length
    ? new Map(
        (
          await db.user.findMany({
            where: { id: { in: uploaderIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        ).map((user) => [user.id, `${user.firstName} ${user.lastName}`]),
      )
    : new Map<string, string>();

  return rows.map((row) =>
    shape(row, row.uploadedById ? (uploaders.get(row.uploadedById) ?? null) : null),
  );
}

/** One-line summary for the profile header. */
export function documentSummary(documents: PersonDocument[]) {
  return {
    total: documents.length,
    verified: documents.filter((entry) => entry.status === "verified").length,
    pending: documents.filter((entry) => entry.status === "pending").length,
    expiring: documents.filter((entry) => entry.status === "expiring").length,
    expired: documents.filter((entry) => entry.status === "expired").length,
  };
}
