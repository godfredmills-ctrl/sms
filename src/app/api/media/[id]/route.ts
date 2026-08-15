import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { parseTransforms } from "@/lib/image-transforms";
import { renderImage } from "@/lib/images";
import { readStoredFile } from "@/lib/storage";

/**
 * Renders a site media item with its transform stack applied.
 *
 * Public by design: these are the images on the school's public website, and a
 * permission check here would break the site for the visitors it exists for.
 * The route only ever serves rows in `SiteMedia`, so nothing reaches it that
 * has not been deliberately added to the media library.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const media = await db.siteMedia.findUnique({
    where: { id },
    select: {
      transforms: true,
      updatedAt: true,
      file: { select: { storageKey: true, mimeType: true, deletedAt: true } },
    },
  });

  if (!media || media.file.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!media.file.mimeType.startsWith("image/")) {
    return NextResponse.json({ error: "Not an image" }, { status: 415 });
  }

  let original: Buffer;
  try {
    original = await readStoredFile(media.file.storageKey);
  } catch {
    return NextResponse.json({ error: "File missing from storage" }, { status: 404 });
  }

  const transforms = parseTransforms(media.transforms);

  try {
    const { buffer, contentType } = await renderImage(original, transforms);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        // Keyed on updatedAt, so re-editing an image busts the cache without
        // anyone having to remember to change the URL.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        ETag: `"${id}-${media.updatedAt.getTime()}"`,
      },
    });
  } catch {
    // A transform that sharp rejects should still show the picture rather than
    // leaving a broken image on the school's home page.
    return new NextResponse(new Uint8Array(original), {
      headers: {
        "Content-Type": media.file.mimeType,
        "Cache-Control": "public, max-age=300",
      },
    });
  }
}
