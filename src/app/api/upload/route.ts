import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_UPLOAD_BYTES, storeFile } from "@/lib/storage";
import { slugify } from "@/lib/utils";

export const maxDuration = 60;

/**
 * File upload.
 *
 * Returns the created FileAsset and, when a folder is supplied, the Document
 * that wraps it. Validation lives in `storeFile` so every write path — this
 * route, imports, generated PDFs — enforces the same size and type rules.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!user.permissions.has("document.upload") && !user.roleKeys.includes("super_admin")) {
    return NextResponse.json({ error: "You cannot upload documents." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Malformed upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was attached." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Files must be under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.` },
      { status: 413 },
    );
  }

  const folderId = String(form.get("folderId") ?? "") || null;
  const title = String(form.get("title") ?? "").trim() || file.name;
  const description = String(form.get("description") ?? "").trim() || null;
  const tags = String(form.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const accessLevel = String(form.get("accessLevel") ?? "STAFF");

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    const stored = await storeFile({
      buffer,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      folder: folderId ? `documents/${slugify(title).slice(0, 24)}` : "documents",
      uploadedById: user.id,
    });

    // A bare upload with no folder is just an attachment; only a foldered
    // upload becomes a cabinet document with access control and versioning.
    let documentId: string | null = null;
    if (folderId) {
      const document = await db.document.create({
        data: {
          folderId,
          fileId: stored.id,
          title,
          description,
          tags,
          accessLevel: accessLevel as never,
          createdById: user.id,
          ownerId: user.id,
          versions: {
            create: { fileId: stored.id, version: 1, createdById: user.id },
          },
        },
      });
      documentId = document.id;

      await db.auditLog.create({
        data: {
          userId: user.id,
          actorLabel: user.fullName,
          action: "document.upload",
          entity: "Document",
          entityId: document.id,
          summary: `Uploaded "${title}" (${Math.round(file.size / 1024)}KB)`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      file: stored,
      documentId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
