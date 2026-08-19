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
 *
 * `visibility=public` is for artwork rather than records: a logo, a crest,
 * letterhead. Those have to load for people with no session — the login page,
 * the public site, and the verification page a scanned certificate leads to —
 * and `/api/files` refuses anyone not signed in, by design. So a public upload
 * is also registered in the media library and addressed through `/api/media`,
 * which is the route that exists to be read by the public. Without this a
 * school uploads its logo, sees it everywhere it looks, and never learns it is
 * missing for everyone else.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The cabinet permission, or any of the person-file permissions: a registrar
  // scanning a birth certificate during admission holds student.create and
  // probably not document.upload, and refusing the scan at that moment is how
  // records end up permanently paperless.
  const mayUpload =
    user.roleKeys.includes("super_admin") ||
    ["document.upload", "student.document.manage", "student.create", "staff.update", "staff.create", "student.guardian.manage", "communication.memo.create", "communication.message"].some(
      (permission) => user.permissions.has(permission),
    );
  if (!mayUpload) {
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

    if (String(form.get("visibility") ?? "") === "public") {
      if (!stored.mimeType.startsWith("image/")) {
        return NextResponse.json(
          { error: "Only images can be published." },
          { status: 400 },
        );
      }

      // The library needs a site to belong to. A school setting its logo has
      // not necessarily opened the website module yet, and refusing the upload
      // over a row it does not know exists would be a strange thing to explain.
      const existing = await db.site.findFirst({ select: { id: true } });
      const site =
        existing ??
        (await db.site.create({
          data: {
            name:
              (await db.school.findFirst({ select: { name: true } }))?.name ?? "School",
            slug: "main",
          },
          select: { id: true },
        }));

      const media = await db.siteMedia.create({
        data: {
          siteId: site.id,
          fileId: stored.id,
          altText: title,
          folder: "branding",
          transforms: {} as never,
        },
      });

      return NextResponse.json({
        ok: true,
        file: { ...stored, url: `/api/media/${media.id}` },
        mediaId: media.id,
      });
    }

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
