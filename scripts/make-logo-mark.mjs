/**
 * Cuts the Mills Technologies mark out of its background.
 *
 * The supplied logo is 2000 square with the mark floating in the middle of a
 * deep indigo gradient and no transparency. That is fine as a social avatar
 * and useless everywhere else: placed on a white page it is a navy square,
 * and placed on a navy cover it is a slightly different navy square with a
 * visible edge, which is worse because it looks like a mistake rather than a
 * choice.
 *
 * So it is matted properly. The background is a vertical gradient between two
 * sampled colours, which means the background colour at any pixel is known
 * exactly. Alpha comes from how far the pixel is from that colour, and the
 * colour is then un-premultiplied so the anti-aliased edges of the letters
 * stay clean instead of picking up a navy fringe.
 *
 * Run once. The result is committed.
 *
 *   node scripts/make-logo-mark.mjs
 */

import sharp from "sharp";

const SOURCE = "public/brand/mills-technologies.png";
const TARGET = "public/brand/mills-technologies-mark.png";

/** Sampled from the corners of the source. */
const TOP = [0x0e, 0x00, 0x66];
const BOTTOM = [0x07, 0x00, 0x32];

/**
 * How far from the background a pixel has to be before it counts as ink.
 *
 * Low enough to keep the soft edge of the type, high enough that the gradient
 * banding in the source does not become a faint rectangle in the result.
 */
const FLOOR = 10;
const CEILING = 90;

const { data, info } = await sharp(SOURCE)
  .raw()
  .toBuffer({ resolveWithObject: true });

const out = Buffer.alloc(info.width * info.height * 4);

let opaque = 0;

for (let y = 0; y < info.height; y += 1) {
  const t = y / (info.height - 1);
  const bg = [
    TOP[0] + (BOTTOM[0] - TOP[0]) * t,
    TOP[1] + (BOTTOM[1] - TOP[1]) * t,
    TOP[2] + (BOTTOM[2] - TOP[2]) * t,
  ];

  for (let x = 0; x < info.width; x += 1) {
    const i = (y * info.width + x) * info.channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const distance = Math.max(
      Math.abs(r - bg[0]),
      Math.abs(g - bg[1]),
      Math.abs(b - bg[2]),
    );

    const alpha = Math.max(
      0,
      Math.min(1, (distance - FLOOR) / (CEILING - FLOOR)),
    );

    const o = (y * info.width + x) * 4;

    if (alpha <= 0) {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = 0;
      continue;
    }

    // Un-premultiply: the pixel is ink over background, and what is wanted is
    // the ink on its own. Without this every edge pixel carries a share of the
    // navy, and the mark gets a dark halo on a pale page.
    const unmix = (channel, ground) =>
      Math.max(0, Math.min(255, Math.round((channel - ground * (1 - alpha)) / alpha)));

    out[o] = unmix(r, bg[0]);
    out[o + 1] = unmix(g, bg[1]);
    out[o + 2] = unmix(b, bg[2]);
    out[o + 3] = Math.round(alpha * 255);
    opaque += 1;
  }
}

const image = sharp(out, {
  raw: { width: info.width, height: info.height, channels: 4 },
});

// Trimmed to the mark, so whoever places it is positioning the artwork rather
// than a field of empty pixels around it.
const trimmed = await image.trim({ threshold: 1 }).png({ compressionLevel: 9 }).toBuffer();

await sharp(trimmed).toFile(TARGET);

const meta = await sharp(TARGET).metadata();
console.log(
  `  ${TARGET}: ${meta.width}x${meta.height}, ${(trimmed.length / 1024).toFixed(0)}KB, ` +
    `${((opaque / (info.width * info.height)) * 100).toFixed(1)}% of the source was ink`,
);
