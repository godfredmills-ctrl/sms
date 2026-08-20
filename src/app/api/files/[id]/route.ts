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

  // A file attached to a message is readable by the people in that
  // conversation, and by nobody else.
  //
  // Both halves of that mattered. Without it a parent could not open the fee
  // statement the bursar had just sent them — a message attachment carries no
  // cabinet document, and the rule below grants those to staff only. And
  // "staff" was too generous in the other direction: it let any teacher in
  // the school read an attachment from a conversation they were never part
  // of, because nothing tied the file back to the thread.
  const viaConversation = await db.directMessage.findFirst({
    where: {
      attachmentIds: { has: id },
      conversation: { members: { some: { userId: user.id } } },
    },
    select: { id: true },
  });

  if (!viaConversation && !canRead(file, user)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let buffer: Buffer;
  try {
    buffer = await readStoredFile(file.storageKey);
  } catch {
    return new NextResponse("File is missing from storage", { status: 404 });
  }

  const url = new URL(request.url);
  // SVG is a document that can run script, and this route serves from the
  // app's own origin — inline it would be stored XSS against whoever opens
  // it. It is always handed over as a download instead.
  const neverInline = ["image/svg+xml", "text/html", "application/xhtml+xml"];
  const asDownload =
    url.searchParams.has("download") || neverInline.includes(file.mimeType);

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
      // RFC 6266: the quoted `filename` is a fallback and must not itself
      // be percent-encoded — browsers show it literally, so "Term 1 Report.pdf"
      // arrived as "Term%201%20Report.pdf". The encoded form belongs in
      // `filename*`, which every current browser prefers. The fallback is
      // stripped of quotes and control characters instead: a newline in a
      // stored filename would otherwise end the header early and let the rest
      // be read as headers of its own.
      "Content-Disposition":
        `${asDownload ? "attachment" : "inline"}; ` +
        `filename="${file.originalName.replace(/[\r\n"\\]/g, "")}"; ` +
        `filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
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

  // A file with no cabinet document is an attachment of some other record —
  // a student photo, a memo attachment, a file on a message. Staff may read
  // those; a parent or student may not, which is correct for a medical scan
  // and wrong for the file that was just sent TO them. The message case is
  // resolved by membership before this point (see canReadMessageAttachment),
  // so what remains here is genuinely a staff-side record.
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
