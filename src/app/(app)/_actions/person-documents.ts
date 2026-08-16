"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteStoredFile, storeFile } from "@/lib/storage";
import type { PersonKind } from "@/lib/person-documents";

export type DocumentState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Permission per person type, not one blanket document permission.
 *
 * A form teacher who may attach a birth certificate to a student has no
 * business filing a colleague's employment contract, and the two live in
 * different parts of the school's obligations.
 */
const PERMISSIONS: Record<PersonKind, { manage: string; verify: string }> = {
  student: { manage: "student.document.manage", verify: "student.update" },
  staff: { manage: "staff.update", verify: "staff.update" },
  guardian: { manage: "student.guardian.manage", verify: "student.update" },
};

function parseKind(value: string): PersonKind | null {
  return value === "student" || value === "staff" || value === "guardian"
    ? value
    : null;
}

async function confirmPersonExists(kind: PersonKind, personId: string) {
  const found =
    kind === "student"
      ? await db.student.findUnique({ where: { id: personId }, select: { id: true } })
      : kind === "staff"
        ? await db.staff.findUnique({ where: { id: personId }, select: { id: true } })
        : await db.guardian.findUnique({
            where: { id: personId },
            select: { id: true },
          });

  return Boolean(found);
}

function profilePath(kind: PersonKind, personId: string): string {
  return kind === "student"
    ? `/students/${personId}`
    : kind === "staff"
      ? `/staff/${personId}`
      : `/guardians/${personId}`;
}

export async function uploadPersonDocumentAction(
  _previous: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const kind = parseKind(text(formData, "kind"));
  const personId = text(formData, "personId");
  if (!kind || !personId) return { error: "Missing person." };

  let user;
  try {
    user = await authorize(PERMISSIONS[kind].manage);
  } catch (error) {
    return { error: (error as Error).message };
  }

  // The owning record is confirmed before anything is written to storage —
  // otherwise a bad id leaves an uploaded file with no row pointing at it.
  if (!(await confirmPersonExists(kind, personId))) {
    return { error: "That person no longer exists." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  const title = text(formData, "title") || file.name;
  const category = text(formData, "category") || "OTHER";
  const expiresAt = text(formData, "expiresAt");

  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
    return { error: "That expiry date is not valid." };
  }

  try {
    const stored = await storeFile({
      buffer: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      folder: `${kind}-documents`,
      uploadedById: user.id,
    });

    const data = {
      fileId: stored.id,
      category,
      title,
      notes: text(formData, "notes") || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      uploadedById: user.id,
    };

    if (kind === "student") {
      await db.studentDocument.create({ data: { ...data, studentId: personId } });
    } else if (kind === "staff") {
      await db.staffDocument.create({ data: { ...data, staffId: personId } });
    } else {
      await db.guardianDocument.create({ data: { ...data, guardianId: personId } });
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: `${kind}.document.upload`,
        entity: kind === "student" ? "Student" : kind === "staff" ? "Staff" : "Guardian",
        entityId: personId,
        summary: `Uploaded "${title}"`,
      },
    });
  } catch (error) {
    return { error: (error as Error).message };
  }

  revalidatePath(profilePath(kind, personId));
  return { ok: true, message: `"${title}" uploaded.` };
}

/**
 * Marks a document as checked against the original.
 *
 * Verification records *who* confirmed it, because the value of the flag is
 * entirely in being able to ask that person about it later.
 */
export async function verifyPersonDocumentAction(formData: FormData) {
  const kind = parseKind(text(formData, "kind"));
  const personId = text(formData, "personId");
  const id = text(formData, "id");
  if (!kind || !personId || !id) return;

  const user = await authorize(PERMISSIONS[kind].verify);

  const current =
    kind === "student"
      ? await db.studentDocument.findUnique({
          where: { id },
          select: { isVerified: true, title: true },
        })
      : kind === "staff"
        ? await db.staffDocument.findUnique({
            where: { id },
            select: { isVerified: true, title: true },
          })
        : await db.guardianDocument.findUnique({
            where: { id },
            select: { isVerified: true, title: true },
          });

  if (!current) return;

  const next = !current.isVerified;
  const data = {
    isVerified: next,
    verifiedBy: next ? user.fullName : null,
    verifiedAt: next ? new Date() : null,
  };

  if (kind === "student") {
    await db.studentDocument.update({ where: { id }, data });
  } else if (kind === "staff") {
    await db.staffDocument.update({ where: { id }, data });
  } else {
    await db.guardianDocument.update({ where: { id }, data });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: `${kind}.document.${next ? "verify" : "unverify"}`,
      entity: kind === "student" ? "Student" : kind === "staff" ? "Staff" : "Guardian",
      entityId: personId,
      summary: `${next ? "Verified" : "Withdrew verification of"} "${current.title}"`,
    },
  });

  revalidatePath(profilePath(kind, personId));
}

export async function deletePersonDocumentAction(formData: FormData) {
  const kind = parseKind(text(formData, "kind"));
  const personId = text(formData, "personId");
  const id = text(formData, "id");
  if (!kind || !personId || !id) return;

  const user = await authorize(PERMISSIONS[kind].manage);

  const record =
    kind === "student"
      ? await db.studentDocument.findUnique({
          where: { id },
          select: { fileId: true, title: true },
        })
      : kind === "staff"
        ? await db.staffDocument.findUnique({
            where: { id },
            select: { fileId: true, title: true },
          })
        : await db.guardianDocument.findUnique({
            where: { id },
            select: { fileId: true, title: true },
          });

  if (!record) return;

  if (kind === "student") {
    await db.studentDocument.delete({ where: { id } });
  } else if (kind === "staff") {
    await db.staffDocument.delete({ where: { id } });
  } else {
    await db.guardianDocument.delete({ where: { id } });
  }

  // The stored object goes too. A personal identity document left in the
  // bucket after its record was removed is precisely what a retention policy
  // exists to prevent.
  await deleteStoredFile(record.fileId).catch(() => undefined);

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: `${kind}.document.delete`,
      entity: kind === "student" ? "Student" : kind === "staff" ? "Staff" : "Guardian",
      entityId: personId,
      summary: `Deleted "${record.title}"`,
    },
  });

  revalidatePath(profilePath(kind, personId));
}
