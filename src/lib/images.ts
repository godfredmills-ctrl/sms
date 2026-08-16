import "server-only";

import sharp from "sharp";

import type { Transforms } from "@/lib/image-transforms";

/**
 * Server-side image manipulation for the website media library.
 *
 * Edits are stored as a JSON transform stack against the original file and
 * applied on the way out, never in place. That is what makes them
 * non-destructive: a school that crops a photograph badly can widen the crop
 * again a year later, because the original bytes were never overwritten.
 *
 * The vocabulary itself lives in `image-transforms.ts` so the editor can share
 * it without pulling sharp — a native binary — into the browser bundle.
 */

/**
 * Normalises any image sharp can read into something pdf-lib can embed.
 *
 * pdf-lib embeds PNG and JPEG and nothing else, while a school's crest is as
 * likely to be an SVG or a WebP. Rather than refuse those, everything unusual
 * is re-encoded to PNG here; PNG and JPEG pass through untouched so a
 * photograph is not silently inflated into a lossless copy of itself.
 *
 * Oversized images are also brought down to 1600px on the long edge. A crest
 * occupies about an inch on a certificate, so anything larger is weight in
 * every copy of a document that gets stored, emailed and printed.
 */
export async function toEmbeddableImage(
  input: Buffer,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  try {
    const pipeline = sharp(input, { failOn: "none" });
    const meta = await pipeline.metadata();

    const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
    const oversized = longEdge > 1600;
    const usable = meta.format === "png" || meta.format === "jpeg";

    if (usable && !oversized) {
      return {
        bytes: new Uint8Array(input),
        mimeType: meta.format === "png" ? "image/png" : "image/jpeg",
      };
    }

    let resized = pipeline;
    if (oversized) {
      resized = resized.resize({ width: 1600, height: 1600, fit: "inside" });
    }

    // JPEG stays JPEG when only the size was wrong; everything else becomes
    // PNG, which keeps transparency on a crest cut out of its background.
    if (meta.format === "jpeg") {
      return {
        bytes: new Uint8Array(await resized.jpeg({ quality: 88, mozjpeg: true }).toBuffer()),
        mimeType: "image/jpeg",
      };
    }

    return {
      bytes: new Uint8Array(await resized.png({ compressionLevel: 9 }).toBuffer()),
      mimeType: "image/png",
    };
  } catch {
    // Not an image, or one sharp cannot decode. The caller draws a placeholder.
    return null;
  }
}

/**
 * Applies a transform stack.
 *
 * Order matters and is fixed: rotate, then crop, then resize, then colour, then
 * blur. Cropping before rotating would take the crop from a different part of
 * the picture than the one the editor showed.
 */
export async function renderImage(
  input: Buffer,
  transforms: Transforms,
): Promise<{ buffer: Buffer; contentType: string }> {
  let pipeline = sharp(input, { failOn: "none" }).rotate();

  if (transforms.rotate) {
    pipeline = pipeline.rotate(transforms.rotate, {
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    });
  }
  if (transforms.flipH) pipeline = pipeline.flop();
  if (transforms.flipV) pipeline = pipeline.flip();

  if (transforms.crop) {
    // Percentages are resolved against the metadata *after* rotation, which is
    // why the crop is read here rather than from the original dimensions.
    const meta = await pipeline.toBuffer({ resolveWithObject: true });
    const { width = 0, height = 0 } = meta.info;

    const left = Math.min(Math.round((transforms.crop.x / 100) * width), width - 1);
    const top = Math.min(Math.round((transforms.crop.y / 100) * height), height - 1);
    const cropWidth = Math.max(1, Math.round((transforms.crop.width / 100) * width));
    const cropHeight = Math.max(1, Math.round((transforms.crop.height / 100) * height));

    pipeline = sharp(meta.data).extract({
      left,
      top,
      width: Math.min(cropWidth, width - left),
      height: Math.min(cropHeight, height - top),
    });
  }

  if (transforms.width || transforms.height) {
    pipeline = pipeline.resize({
      width: transforms.width,
      height: transforms.height,
      fit: transforms.fit ?? "cover",
      withoutEnlargement: true,
    });
  }

  const brightness = (transforms.brightness ?? 100) / 100;
  const saturation = (transforms.saturation ?? 100) / 100;
  if (brightness !== 1 || saturation !== 1) {
    pipeline = pipeline.modulate({ brightness, saturation });
  }

  if (transforms.contrast) {
    // Linear contrast around the mid-point: a * x + b, with b chosen so 128
    // stays put and only the spread changes.
    const a = 1 + transforms.contrast / 100;
    pipeline = pipeline.linear(a, 128 * (1 - a));
  }

  if (transforms.grayscale) pipeline = pipeline.grayscale();
  if (transforms.sepia) {
    pipeline = pipeline.recomb([
      [0.393, 0.769, 0.189],
      [0.349, 0.686, 0.168],
      [0.272, 0.534, 0.131],
    ]);
  }
  if (transforms.sharpen) pipeline = pipeline.sharpen();
  if (transforms.blur && transforms.blur > 0) {
    pipeline = pipeline.blur(Math.min(50, transforms.blur));
  }

  const format = transforms.format ?? "webp";
  const quality = Math.min(100, Math.max(40, transforms.quality ?? 82));

  const buffer =
    format === "jpeg"
      ? await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer()
      : format === "png"
        ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
        : await pipeline.webp({ quality }).toBuffer();

  return {
    buffer,
    contentType:
      format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : "image/webp",
  };
}
