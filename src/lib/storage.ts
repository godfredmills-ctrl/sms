import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "./db";
import { env } from "./env";
import { slugify } from "./utils";

/**
 * File storage.
 *
 * The local driver writes to a directory on disk — on Railway, attach a volume
 * and point STORAGE_LOCAL_DIR at it (e.g. /data/uploads). Files are served
 * back through /api/files/[id], never as static paths, so access control is
 * applied on every read.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Extensions the system will accept and can preview. */
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

export type PreviewKind = "image" | "pdf" | "text" | "office" | "none";

/** Drives which preview component the document viewer renders. */
export function previewKindFor(mimeType: string): PreviewKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  if (
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation")
  ) {
    return "office";
  }
  return "none";
}

function localRoot(): string {
  return path.resolve(process.cwd(), env.storage.localDir);
}

/**
 * Builds a storage key. The random prefix prevents collisions and stops a
 * user-supplied filename from ever being used as a path.
 */
function buildKey(originalName: string, folder = "general"): string {
  const extension = path.extname(originalName).toLowerCase().slice(0, 12);
  const base = slugify(path.basename(originalName, extension)) || "file";
  const stamp = new Date().toISOString().slice(0, 7); // YYYY-MM
  return `${slugify(folder)}/${stamp}/${randomUUID()}-${base}${extension}`;
}

/** Guards against a crafted key escaping the storage root. */
function resolveLocalPath(storageKey: string): string {
  const root = localRoot();
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Invalid storage key.");
  }
  return resolved;
}

export type StoredFile = {
  id: string;
  storageKey: string;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export async function storeFile(input: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folder?: string;
  uploadedById?: string | null;
  /** Skip the MIME allow-list — used for system-generated PDFs. */
  trusted?: boolean;
}): Promise<StoredFile> {
  if (input.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
    );
  }
  if (!input.trusted && !ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new Error(`Files of type "${input.mimeType}" are not accepted.`);
  }

  const storageKey = buildKey(input.originalName, input.folder);

  if (env.storage.driver === "s3") {
    throw new Error(
      "The S3 storage driver is not implemented. Set STORAGE_DRIVER=local and attach a Railway volume.",
    );
  }

  const destination = resolveLocalPath(storageKey);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, input.buffer);

  const checksum = createHash("sha256").update(input.buffer).digest("hex");
  const extension = path.extname(input.originalName).replace(".", "").toLowerCase();

  const asset = await db.fileAsset.create({
    data: {
      storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      extension: extension || null,
      sizeBytes: input.buffer.byteLength,
      checksum,
      uploadedById: input.uploadedById ?? null,
    },
  });

  return {
    id: asset.id,
    storageKey,
    url: fileUrl(asset.id),
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
  };
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  if (env.storage.driver === "s3") {
    throw new Error("The S3 storage driver is not implemented.");
  }
  return readFile(resolveLocalPath(storageKey));
}

export async function deleteStoredFile(fileId: string): Promise<void> {
  const asset = await db.fileAsset.findUnique({ where: { id: fileId } });
  if (!asset) return;

  await unlink(resolveLocalPath(asset.storageKey)).catch(() => undefined);
  await db.fileAsset.update({
    where: { id: fileId },
    data: { deletedAt: new Date() },
  });
}

/** All file reads go through the API route so permissions are enforced. */
export function fileUrl(fileId: string): string {
  return `/api/files/${fileId}`;
}

export function downloadUrl(fileId: string): string {
  return `/api/files/${fileId}?download=1`;
}
