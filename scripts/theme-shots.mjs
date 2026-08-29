/**
 * Photographs one screen in both themes, for judging a colour change.
 *
 * Separate from screenshots.mjs, which produces the figures for the manual and
 * only ever needs the light theme. This exists because a colour decision made
 * by reading hex values in a stylesheet is a guess, and the two themes have to
 * be looked at side by side.
 *
 *   node scripts/theme-shots.mjs <session-token> [path]
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import puppeteer from "puppeteer-core";

const TOKEN = process.argv[2];
const PATH = process.argv[3] ?? "/dashboard";
if (!TOKEN) {
  console.error("Usage: node scripts/theme-shots.mjs <session-token> [path]");
  process.exit(1);
}

const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const executablePath = process.env.CHROME_PATH ?? BROWSERS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("No browser found. Set CHROME_PATH.");
  process.exit(1);
}

mkdirSync(".preview", { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--force-color-profile=srgb"],
  defaultViewport: { width: 1440, height: 950, deviceScaleFactor: 1.5 },
});

const page = await browser.newPage();

await page.evaluateOnNewDocument(() => {
  try {
    window.localStorage.setItem("pwa:install-dismissed", "1");
    window.localStorage.setItem("pwa:push-dismissed", "1");
  } catch {
    // Storage blocked; the prompts appear and there is nothing to do here.
  }
});

await browser.setCookie({
  name: "sms_session",
  value: TOKEN,
  domain: "127.0.0.1",
  path: "/",
});

for (const theme of ["light", "dark"]) {
  await page.goto("http://127.0.0.1:3000" + PATH, {
    waitUntil: "networkidle2",
    timeout: 120_000,
  });

  // Stamped directly rather than through the toggle: the toggle writes a
  // preference and reloads, and this only needs the rendered result.
  await page.evaluate((value) => {
    document.documentElement.setAttribute("data-theme", value);
  }, theme);

  await new Promise((resolve) => setTimeout(resolve, 1200));

  const file = join(".preview", `theme-${theme}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${file}`);
}

await browser.close();
