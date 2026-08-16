import "server-only";

import { db } from "@/lib/db";
import { parseTransforms } from "@/lib/image-transforms";
import { renderImage, toEmbeddableImage } from "@/lib/images";
import { readStoredFile } from "@/lib/storage";
import { parseLayout, resolveBinding } from "@/lib/templates";

/**
 * Turns the image references in a template into bytes the PDF renderer can
 * embed.
 *
 * The renderer is deliberately synchronous about IO — it takes bytes and draws
 * them — so the fetching lives here, on the server side of the line, where the
 * file store and the database are reachable.
 *
 * **Only the school's own files are loaded.** A reference resolves when it
 * points at `/api/files/<id>`, `/api/media/<id>`, or is a `data:` URL, and is
 * ignored otherwise. That rules out fetching an arbitrary URL from inside the
 * server to render a document, which is how a logo field turns into a way of
 * reaching whatever the server can reach and putting the response in a PDF.
 * The cost is that a logo pasted in as `https://someone-elses-site/logo.png`
 * does not appear on printed documents; the fix for a school is to upload it,
 * and the branding settings say so.
 */

export type EmbeddedImage = { bytes: Uint8Array; mimeType: string };

/** `/api/files/<id>` and `/api/media/<id>`, with or without a query string. */
const INTERNAL_FILE = /^\/api\/files\/([A-Za-z0-9_-]+)/;
const INTERNAL_MEDIA = /^\/api\/media\/([A-Za-z0-9_-]+)/;

/** Roughly the largest sensible crest or signature, before re-encoding. */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export async function loadDocumentImage(
  reference: string | null | undefined,
): Promise<EmbeddedImage | null> {
  const value = (reference ?? "").trim();
  if (!value) return null;

  if (value.startsWith("data:")) return fromDataUrl(value);

  const media = INTERNAL_MEDIA.exec(value);
  if (media) return fromSiteMedia(media[1]);

  const internal = INTERNAL_FILE.exec(value);
  if (!internal) return null;

  const asset = await db.fileAsset.findUnique({
    where: { id: internal[1] },
    select: { storageKey: true, sizeBytes: true, deletedAt: true },
  });
  if (!asset || asset.deletedAt) return null;
  if (asset.sizeBytes > MAX_SOURCE_BYTES) return null;

  try {
    return await toEmbeddableImage(await readStoredFile(asset.storageKey));
  } catch {
    // The row outlived the object. A missing crest is not worth failing a
    // certificate the school is standing over.
    return null;
  }
}

/**
 * A media-library image, with its saved crop and colour edits applied.
 *
 * The transforms matter: the library is where a school straightens and crops
 * its crest, and a certificate showing the unedited original would not match
 * the one on their own website.
 */
async function fromSiteMedia(id: string): Promise<EmbeddedImage | null> {
  const media = await db.siteMedia.findUnique({
    where: { id },
    select: {
      transforms: true,
      file: { select: { storageKey: true, mimeType: true, sizeBytes: true, deletedAt: true } },
    },
  });

  if (!media || media.file.deletedAt) return null;
  if (!media.file.mimeType.startsWith("image/")) return null;
  if (media.file.sizeBytes > MAX_SOURCE_BYTES) return null;

  try {
    const original = await readStoredFile(media.file.storageKey);
    const rendered = await renderImage(original, {
      ...parseTransforms(media.transforms),
      // The library serves WebP to browsers; a PDF needs PNG.
      format: "png",
    });
    return await toEmbeddableImage(rendered.buffer);
  } catch {
    return null;
  }
}

async function fromDataUrl(value: string): Promise<EmbeddedImage | null> {
  const comma = value.indexOf(",");
  if (comma < 0) return null;

  const header = value.slice(5, comma);
  if (!header.startsWith("image/") || !header.includes(";base64")) return null;

  try {
    const buffer = Buffer.from(value.slice(comma + 1), "base64");
    if (buffer.length === 0 || buffer.length > MAX_SOURCE_BYTES) return null;
    // Still normalised: a data URL is as likely to hold an SVG as a PNG, and
    // its declared type is not evidence of what the bytes actually are.
    return await toEmbeddableImage(buffer);
  } catch {
    return null;
  }
}

/**
 * Resolves every image a layout needs, keyed by the reference it came from.
 *
 * Elements bind to a path (`school.logoUrl`) rather than to a URL, so the
 * binding is resolved against the same context the text elements use, and the
 * resulting URL is what gets loaded. Two elements pointing at the same logo
 * load it once.
 */
export async function resolveTemplateImages(
  layout: unknown,
  context: Record<string, unknown>,
): Promise<Record<string, EmbeddedImage>> {
  const parsed = parseLayout(layout);

  const references = new Set<string>();
  if (parsed.backgroundUrl) references.add(parsed.backgroundUrl);

  for (const element of parsed.elements) {
    if (element.type !== "image") continue;
    // An image element's value is a binding when it names one, and a URL when
    // the school pasted one straight in. Trying the binding first means a
    // template built in the app keeps working when the logo changes.
    const resolved = resolveBinding(element.value, context) || element.value;
    if (resolved) references.add(resolved);
  }

  const entries = await Promise.all(
    [...references].map(
      async (reference) => [reference, await loadDocumentImage(reference)] as const,
    ),
  );

  const images: Record<string, EmbeddedImage> = {};
  for (const [reference, image] of entries) {
    if (image) images[reference] = image;
  }
  return images;
}
