import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { db } from "./db";
import { env } from "./env";
import { slugify } from "./utils";

/**
 * File storage.
 *
 * Two drivers:
 *
 * - **local** writes to a directory on disk. On Railway that directory is inside
 *   the container unless a volume is mounted, so uploads are lost on every
 *   redeploy — fine for development, wrong for a school.
 * - **s3** talks to any S3-compatible object store. Cloudflare R2, Backblaze B2
 *   and MinIO all work; only the endpoint changes.
 *
 * Either way, files are served back through `/api/files/[id]`, never as public
 * object URLs. That is deliberate: a student's medical form and a fee statement
 * live in the same bucket as the school's logo, and access control has to be
 * applied per request rather than per bucket. Making the bucket public would
 * hand out every document to anyone who guesses a key.
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

// -----------------------------------------------------------------------------
// S3-compatible driver
// -----------------------------------------------------------------------------

export function isS3(): boolean {
  return env.storage.driver === "s3";
}

/**
 * Everything that must be set before the S3 driver can work, as a list of what
 * is missing rather than a boolean — a deploy that fails should say which
 * variable is absent, not just that "storage is misconfigured".
 */
export function s3ConfigProblems(): string[] {
  const problems: string[] = [];
  if (!env.storage.s3Endpoint) problems.push("S3_ENDPOINT is not set");
  if (!env.storage.s3Bucket) problems.push("S3_BUCKET is not set");
  if (!env.storage.s3AccessKeyId) problems.push("S3_ACCESS_KEY_ID is not set");
  if (!env.storage.s3SecretAccessKey) problems.push("S3_SECRET_ACCESS_KEY is not set");

  if (env.storage.s3Endpoint) {
    // Parsed defensively: a malformed endpoint is exactly the case this
    // function exists to report, so throwing on it would replace a useful
    // message with a 500 on the page that was meant to explain the problem.
    let endpoint: URL | null = null;
    try {
      endpoint = new URL(env.storage.s3Endpoint);
    } catch {
      problems.push(
        `S3_ENDPOINT is not a valid URL ("${env.storage.s3Endpoint}") — it should look like https://<account-id>.r2.cloudflarestorage.com`,
      );
    }

    if (endpoint && !/^https?:$/.test(endpoint.protocol)) {
      problems.push("S3_ENDPOINT must start with https://");
    }

    // A bucket name pasted onto the end of the endpoint is the most common way
    // this is set up wrong, and it fails with an opaque 403 rather than a 404.
    if (
      endpoint &&
      env.storage.s3Bucket &&
      endpoint.pathname.replace(/\/$/, "").length > 0
    ) {
      problems.push(
        "S3_ENDPOINT must not include the bucket name — put it in S3_BUCKET instead",
      );
    }
  }

  return problems;
}

let client: S3Client | null = null;

function s3(): S3Client {
  const problems = s3ConfigProblems();
  if (problems.length) {
    throw new Error(`Object storage is not configured: ${problems.join("; ")}.`);
  }

  client ??= new S3Client({
    // R2 has no regions; it wants "auto". Other providers use a real one.
    region: env.storage.s3Region || "auto",
    endpoint: env.storage.s3Endpoint,
    // R2, MinIO and B2 all expect the bucket in the path rather than in the
    // hostname. AWS itself accepts path style too, so this is safe everywhere.
    forcePathStyle: true,
    // The SDK otherwise attaches a CRC32 trailer to every upload. AWS accepts
    // it; several S3-compatible providers reject the request outright, and the
    // error names the checksum rather than the cause. Integrity is covered by
    // the SHA-256 stored on the FileAsset row, so nothing is lost by asking for
    // checksums only where the protocol actually requires them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: env.storage.s3AccessKeyId,
      secretAccessKey: env.storage.s3SecretAccessKey,
    },
  });

  return client;
}

/** Verifies the bucket is reachable and the credentials work. */
export async function checkStorage(): Promise<{
  ok: boolean;
  driver: string;
  detail: string;
}> {
  if (!isS3()) {
    const root = localRoot();
    const ephemeral = !path.isAbsolute(env.storage.localDir);
    return {
      ok: true,
      driver: "local",
      detail: ephemeral
        ? `Writing to ${root} inside the container — uploads are lost on redeploy.`
        : `Writing to ${root}.`,
    };
  }

  const problems = s3ConfigProblems();
  if (problems.length) {
    return { ok: false, driver: "s3", detail: problems.join("; ") };
  }

  try {
    await s3().send(new HeadBucketCommand({ Bucket: env.storage.s3Bucket }));
    return {
      ok: true,
      driver: "s3",
      detail: `Bucket "${env.storage.s3Bucket}" is reachable.`,
    };
  } catch (error) {
    return { ok: false, driver: "s3", detail: (error as Error).message };
  }
}

// -----------------------------------------------------------------------------
// Local driver
// -----------------------------------------------------------------------------

function localRoot(): string {
  return path.resolve(process.cwd(), env.storage.localDir);
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

// -----------------------------------------------------------------------------
// Shared
// -----------------------------------------------------------------------------

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
  const checksum = createHash("sha256").update(input.buffer).digest("hex");

  // The object is written before the database row. If the write fails there is
  // no row pointing at a file that does not exist; if the row fails afterwards
  // an orphaned object costs a fraction of a penny, which is the cheaper of the
  // two ways to be inconsistent.
  if (isS3()) {
    await s3().send(
      new PutObjectCommand({
        Bucket: env.storage.s3Bucket,
        Key: storageKey,
        Body: input.buffer,
        ContentType: input.mimeType,
        Metadata: {
          // Kept for anyone inspecting the bucket directly; the database is
          // still the source of truth for the display name.
          "original-name": encodeURIComponent(input.originalName),
        },
      }),
    );
  } else {
    const destination = resolveLocalPath(storageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, input.buffer);
  }

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
  if (!isS3()) return readFile(resolveLocalPath(storageKey));

  const response = await s3().send(
    new GetObjectCommand({ Bucket: env.storage.s3Bucket, Key: storageKey }),
  );

  if (!response.Body) throw new Error("Object has no body.");

  // transformToByteArray buffers the whole object. Uploads are capped at 25MB,
  // so this stays bounded; streaming would only matter for larger files.
  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteStoredFile(fileId: string): Promise<void> {
  const asset = await db.fileAsset.findUnique({ where: { id: fileId } });
  if (!asset) return;

  if (isS3()) {
    await s3()
      .send(
        new DeleteObjectCommand({
          Bucket: env.storage.s3Bucket,
          Key: asset.storageKey,
        }),
      )
      .catch(() => undefined);
  } else {
    await unlink(resolveLocalPath(asset.storageKey)).catch(() => undefined);
  }

  // Soft-deleted either way: a document removed from the cabinet still has to
  // be explicable later, and the row carries who uploaded it and when.
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
