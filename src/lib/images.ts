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
