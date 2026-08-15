/**
 * The image transform vocabulary — the half that is safe in a browser bundle.
 *
 * The editor and the renderer share this file so the preview and the served
 * image cannot drift apart. The sharp pipeline that actually applies these
 * lives in `images.ts`, which is server-only; importing a filter name into a
 * client component must not drag a native binary along with it.
 */

export type Transforms = {
  /** Percentages of the source image, 0-100. */
  crop?: { x: number; y: number; width: number; height: number };
  rotate?: number;
  flipH?: boolean;
  flipV?: boolean;
  /** 100 = unchanged. */
  brightness?: number;
  saturation?: number;
  /** -100 to 100. */
  contrast?: number;
  blur?: number;
  grayscale?: boolean;
  sepia?: boolean;
  sharpen?: boolean;
  /** Output box; the image is fitted inside it. */
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "inside";
  quality?: number;
  format?: "webp" | "jpeg" | "png";
};

export const FILTER_PRESETS: Array<{
  key: string;
  label: string;
  transforms: Transforms;
}> = [
  { key: "none", label: "Original", transforms: {} },
  { key: "bright", label: "Bright", transforms: { brightness: 112, saturation: 108 } },
  { key: "warm", label: "Warm", transforms: { brightness: 105, saturation: 120 } },
  { key: "muted", label: "Muted", transforms: { saturation: 72, contrast: -8 } },
  { key: "mono", label: "Black and white", transforms: { grayscale: true, contrast: 8 } },
  { key: "sepia", label: "Sepia", transforms: { sepia: true } },
  { key: "sharp", label: "Crisp", transforms: { sharpen: true, contrast: 6 } },
];

export function parseTransforms(value: unknown): Transforms {
  if (!value || typeof value !== "object") return {};
  return value as Transforms;
}

/**
 * CSS filter string that previews a transform stack in the browser.
 *
 * Deliberately mirrors what sharp does on the server, so the editor is a true
 * preview rather than an approximation the school discovers is wrong once the
 * page is live.
 */
export function cssFilterFor(transforms: Transforms): string {
  const parts: string[] = [];

  if (transforms.brightness && transforms.brightness !== 100) {
    parts.push(`brightness(${transforms.brightness}%)`);
  }
  if (transforms.saturation && transforms.saturation !== 100) {
    parts.push(`saturate(${transforms.saturation}%)`);
  }
  if (transforms.contrast) {
    parts.push(`contrast(${100 + transforms.contrast}%)`);
  }
  if (transforms.grayscale) parts.push("grayscale(1)");
  if (transforms.sepia) parts.push("sepia(0.7)");
  if (transforms.blur) parts.push(`blur(${transforms.blur}px)`);

  return parts.join(" ") || "none";
}
