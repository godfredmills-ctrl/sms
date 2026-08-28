/**
 * Renders pages of a PDF to PNG, so they can actually be looked at.
 *
 * There is no other way to check a document produced by pdf-lib. The library
 * reports that it wrote a file and nothing about whether the file has the
 * title on top of the logo, a caption stranded on its own page, or a cover
 * that is a black rectangle. Every one of those builds clean.
 *
 * Uses pdf.js in the browser already on the machine, which needs no native
 * canvas package and no PDF tooling installed.
 *
 *   node scripts/pdf-preview.mjs <file.pdf> [pages] [outDir]
 *   node scripts/pdf-preview.mjs docs/proposal.pdf 1,2,3 .preview
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import puppeteer from "puppeteer-core";

const [file, pagesArg = "1", outDir = ".preview"] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node scripts/pdf-preview.mjs <file.pdf> [pages] [outDir]");
  process.exit(1);
}

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const executablePath = process.env.CHROME_PATH ?? BROWSERS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("No browser found. Set CHROME_PATH.");
  process.exit(1);
}

const wanted = pagesArg.split(",").map((n) => Number(n.trim())).filter(Boolean);
mkdirSync(outDir, { recursive: true });

const pdfBytes = readFileSync(file).toString("base64");
const pdfjs = readFileSync("node_modules/pdfjs-dist/build/pdf.min.mjs", "utf8");
const worker = readFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "utf8");

const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
await page.setContent("<!doctype html><body style='margin:0'></body>");

const images = await page.evaluate(
  async (library, workerSource, base64, wantedPages) => {
    // The worker as a blob, because a file:// worker is blocked and there is
    // no server here to serve one from.
    const blob = new Blob([workerSource], { type: "text/javascript" });
    const workerUrl = URL.createObjectURL(blob);

    const module = await import(
      URL.createObjectURL(new Blob([library], { type: "text/javascript" }))
    );
    module.GlobalWorkerOptions.workerSrc = workerUrl;

    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const doc = await module.getDocument({ data: bytes }).promise;

    const out = [];
    for (const number of wantedPages) {
      if (number > doc.numPages) continue;
      const rendered = await doc.getPage(number);
      const viewport = rendered.getViewport({ scale: 2 });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      // White behind, so a page with no painted background is a white page
      // rather than a transparent one that reads as black in a viewer.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await rendered.render({ canvasContext: context, viewport, canvas }).promise;
      out.push([number, canvas.toDataURL("image/png")]);
    }

    return { pages: doc.numPages, images: out };
  },
  pdfjs,
  worker,
  pdfBytes,
  wanted,
);

await browser.close();

const stem = basename(file).replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
for (const [number, dataUrl] of images.images) {
  const target = join(outDir, `${stem}-p${number}.png`);
  writeFileSync(target, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log(`  ${target}`);
}
console.log(`  ${file}: ${images.pages} pages`);
