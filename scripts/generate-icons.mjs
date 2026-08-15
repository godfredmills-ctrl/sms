/**
 * Generates the PWA icon set.
 *
 * Written as a tiny PNG encoder rather than pulling in an image library: the
 * mark is a few flat shapes, and this keeps the dependency list honest.
 *
 * Run with: node scripts/generate-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, "..", "public", "icons");

const BRAND = [18, 130, 87]; // #128257
const INK = [255, 255, 255];

// -----------------------------------------------------------------------------
// PNG encoding
// -----------------------------------------------------------------------------

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** `pixels` is RGBA, row-major, length size * size * 4. */
function encodePng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type (0 = none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// -----------------------------------------------------------------------------
// Drawing
// -----------------------------------------------------------------------------

/** Signed distance to a rounded rectangle, used for anti-aliased edges. */
function roundedRectDistance(x, y, halfWidth, halfHeight, radius) {
  const dx = Math.abs(x) - (halfWidth - radius);
  const dy = Math.abs(y) - (halfHeight - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function blend(target, offset, colour, alpha) {
  for (let channel = 0; channel < 3; channel += 1) {
    target[offset + channel] = Math.round(
      target[offset + channel] * (1 - alpha) + colour[channel] * alpha,
    );
  }
  target[offset + 3] = Math.max(target[offset + 3], Math.round(alpha * 255));
}

/**
 * Draws a graduation cap: a rhombus board with a small tassel, on a brand
 * background. `padding` is the fraction of the canvas left as safe area —
 * maskable icons need a generous one so nothing is clipped by the mask.
 */
function drawIcon(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  const centre = size / 2;
  const scale = maskable ? 0.52 : 0.68;
  const cornerRadius = maskable ? size / 2 : size * 0.22;

  // Supersample so the diagonal edges of the cap are not jagged.
  const samples = 3;
  const step = 1 / (samples + 1);

  const capHalf = (size * scale) / 2;
  const board = [
    [centre, centre - capHalf * 0.62],
    [centre + capHalf, centre - capHalf * 0.12],
    [centre, centre + capHalf * 0.38],
    [centre - capHalf, centre - capHalf * 0.12],
  ];

  const base = [
    [centre - capHalf * 0.52, centre - capHalf * 0.02],
    [centre + capHalf * 0.52, centre - capHalf * 0.02],
    [centre + capHalf * 0.52, centre + capHalf * 0.5],
    [centre - capHalf * 0.52, centre + capHalf * 0.5],
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;

      let backgroundCoverage = 0;
      let markCoverage = 0;

      for (let sy = 1; sy <= samples; sy += 1) {
        for (let sx = 1; sx <= samples; sx += 1) {
          const px = x + sx * step;
          const py = y + sy * step;

          const distance = roundedRectDistance(
            px - centre,
            py - centre,
            centre,
            centre,
            cornerRadius,
          );
          if (distance <= 0) backgroundCoverage += 1;

          // The base sits below the board; the tassel is a thin vertical bar.
          const inBoard = pointInPolygon(px, py, board);
          const inBase =
            pointInPolygon(px, py, base) && py > centre - capHalf * 0.02;
          const inTassel =
            Math.abs(px - (centre + capHalf * 0.86)) < size * 0.022 &&
            py > centre - capHalf * 0.12 &&
            py < centre + capHalf * 0.42;

          if (inBoard || inBase || inTassel) markCoverage += 1;
        }
      }

      const total = samples * samples;
      if (backgroundCoverage > 0) {
        blend(pixels, offset, BRAND, backgroundCoverage / total);
      }
      if (markCoverage > 0) {
        // Clip the mark to the background so it never bleeds past the corner.
        const clipped = Math.min(markCoverage, backgroundCoverage) / total;
        if (clipped > 0) blend(pixels, offset, INK, clipped);
      }
    }
  }

  return encodePng(size, pixels);
}

// -----------------------------------------------------------------------------

mkdirSync(outputDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "badge-72.png", size: 72 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const target of targets) {
  const png = drawIcon(target.size, { maskable: target.maskable });
  writeFileSync(join(outputDir, target.file), png);
  console.log(`  ${target.file.padEnd(26)} ${target.size}×${target.size}  ${(png.length / 1024).toFixed(1)} KB`);
}

// A vector source, for anyone regenerating at other sizes.
writeFileSync(
  join(outputDir, "icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="School Management System">
  <rect width="512" height="512" rx="113" fill="#128257"/>
  <path d="M256 148 430 235 256 322 82 235Z" fill="#fff"/>
  <path d="M167 262h178v98a89 34 0 0 1-178 0Z" fill="#fff"/>
  <rect x="424" y="235" width="12" height="96" rx="6" fill="#fff"/>
</svg>
`,
);
console.log("  icon.svg                   vector source");
