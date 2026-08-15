import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readStoredFile } from "@/lib/storage";

/**
 * Serves an uploaded file.
 *
 * Files are never exposed as static paths — every read comes through here so
 * a medical report or a transcript cannot be fetched by anyone who guesses a
 * URL. Access is granted when the file is attached to a document the caller
 * may see, or when the caller uploaded it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorised", { status: 401 });

  const { id } = await params;

  const file = await db.fileAsset.findUnique({
    where: { id },
    include: {
      documents: { select: { accessLevel: true, allowedRoleIds: true, allowedUserIds: true } },
    },
  });

  if (!file || file.deletedAt) return new NextResponse("Not found", { status: 404 });

  if (!canRead(file, user)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let buffer: Buffer;
  try {
    buffer = await readStoredFile(file.storageKey);
  } catch {
    return new NextResponse("File is missing from storage", { status: 404 });
  }

  const url = new URL(request.url);
  const asDownload = url.searchParams.has("download");

  // Log downloads of cabinet documents so the school has a paper trail.
  if (asDownload && file.documents.length) {
    await db.documentAccessLog
      .createMany({
        data: (
          await db.document.findMany({ where: { fileId: id }, select: { id: true } })
        ).map((document) => ({
          documentId: document.id,
          userId: user.id,
          action: "DOWNLOAD",
        })),
      })
      .catch(() => undefined);
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(
        file.originalName,
      )}"`,
      // Private: a shared cache must never hold a student's medical record.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

type FileWithDocuments = {
  uploadedById: string | null;
  documents: Array<{
    accessLevel: string;
    allowedRoleIds: string[];
    allowedUserIds: string[];
  }>;
};

function canRead(
  file: FileWithDocuments,
  user: { id: string; portal: string; roleKeys: string[]; permissions: Set<string> },
): boolean {
  if (user.roleKeys.includes("super_admin")) return true;
  if (file.uploadedById === user.id) return true;

  // A file with no cabinet document attached is an attachment of some other
  // record (a student photo, a memo attachment); staff may read those.
  if (!file.documents.length) return user.portal === "STAFF";

  return file.documents.some((document) => {
    if (document.allowedUserIds.includes(user.id)) return true;
    switch (document.accessLevel) {
      case "PUBLIC":
      case "SCHOOL_WIDE":
        return true;
      case "STAFF":
        return user.portal === "STAFF";
      case "ROLE_RESTRICTED":
        return document.allowedRoleIds.some((role) => user.roleKeys.includes(role));
      default:
        return false;
    }
  });
}
