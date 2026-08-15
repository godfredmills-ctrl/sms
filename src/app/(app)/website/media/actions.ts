"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  FILTER_PRESETS,
  parseTransforms,
  type Transforms,
} from "@/lib/image-transforms";
import { storeFile } from "@/lib/storage";

export type MediaState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function num(formData: FormData, key: string, fallback: number): number {
  const parsed = Number(text(formData, key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function uploadMediaAction(
  _previous: MediaState,
  formData: FormData,
): Promise<MediaState> {
  let user;
  try {
    user = await authorize("website.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const siteId = text(formData, "siteId");
  const file = formData.get("file");

  if (!siteId) return { error: "Missing site." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (!file.type.startsWith("image/")) {
    return { error: "Only images belong in the media library." };
  }

  try {
    const stored = await storeFile({
      buffer: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      mimeType: file.type,
      folder: "site-media",
      uploadedById: user.id,
    });

    await db.siteMedia.create({
      data: {
        siteId,
        fileId: stored.id,
        altText: text(formData, "altText") || null,
        caption: text(formData, "caption") || null,
        folder: text(formData, "folder") || "uncategorised",
        transforms: {} as never,
      },
    });
  } catch (error) {
    return { error: (error as Error).message };
  }

  revalidatePath("/website/media");
  return { ok: true, message: "Image added to the library." };
}

/**
 * Saves the edit stack. The original file is never touched, so any edit can be
 * widened, weakened or removed later — which is the whole point of storing the
 * transforms rather than the result.
 */
export async function updateTransformsAction(formData: FormData) {
  await authorize("website.manage");

  const id = text(formData, "id");
  if (!id) return;

  const media = await db.siteMedia.findUnique({
    where: { id },
    select: { transforms: true },
  });
  if (!media) return;

  const current = parseTransforms(media.transforms);

  const preset = text(formData, "preset");
  const presetTransforms =
    preset && preset !== "none"
      ? (FILTER_PRESETS.find((entry) => entry.key === preset)?.transforms ?? {})
      : {};

  const next: Transforms = {
    ...current,
    ...presetTransforms,
    rotate: num(formData, "rotate", current.rotate ?? 0),
    flipH: formData.get("flipH") === "on",
    flipV: formData.get("flipV") === "on",
    brightness: num(formData, "brightness", presetTransforms.brightness ?? 100),
    saturation: num(formData, "saturation", presetTransforms.saturation ?? 100),
    contrast: num(formData, "contrast", presetTransforms.contrast ?? 0),
    blur: num(formData, "blur", 0),
    grayscale: formData.get("grayscale") === "on" || Boolean(presetTransforms.grayscale),
    sepia: formData.get("sepia") === "on" || Boolean(presetTransforms.sepia),
    sharpen: formData.get("sharpen") === "on" || Boolean(presetTransforms.sharpen),
    width: num(formData, "width", 0) || undefined,
    height: num(formData, "height", 0) || undefined,
    quality: Math.min(100, Math.max(40, num(formData, "quality", 82))),
    format: (text(formData, "format") || "webp") as Transforms["format"],
  };

  const cropWidth = num(formData, "cropWidth", 100);
  const cropHeight = num(formData, "cropHeight", 100);

  // A crop covering the whole frame is not a crop; storing it would force an
  // extra decode-and-re-encode on every request for no visible change.
  next.crop =
    cropWidth < 100 || cropHeight < 100
      ? {
          x: Math.min(99, Math.max(0, num(formData, "cropX", 0))),
          y: Math.min(99, Math.max(0, num(formData, "cropY", 0))),
          width: Math.min(100, Math.max(1, cropWidth)),
          height: Math.min(100, Math.max(1, cropHeight)),
        }
      : undefined;

  await db.siteMedia.update({
    where: { id },
    data: { transforms: next as never, renderedUrl: null },
  });

  revalidatePath("/website/media");
}

export async function resetTransformsAction(formData: FormData) {
  await authorize("website.manage");

  const id = text(formData, "id");
  if (!id) return;

  await db.siteMedia.update({
    where: { id },
    data: { transforms: {} as never, renderedUrl: null },
  });

  revalidatePath("/website/media");
}

export async function updateMediaMetaAction(formData: FormData) {
  await authorize("website.manage");

  const id = text(formData, "id");
  if (!id) return;

  await db.siteMedia.update({
    where: { id },
    data: {
      altText: text(formData, "altText") || null,
      caption: text(formData, "caption") || null,
      folder: text(formData, "folder") || "uncategorised",
      tags: text(formData, "tags")
        ? text(formData, "tags")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
    },
  });

  revalidatePath("/website/media");
}

export async function deleteMediaAction(formData: FormData) {
  await authorize("website.manage");

  const id = text(formData, "id");
  if (!id) return;

  // Only the library entry goes; the underlying file stays, because it may be
  // referenced by a page block or a document template.
  await db.siteMedia.delete({ where: { id } });

  revalidatePath("/website/media");
}
