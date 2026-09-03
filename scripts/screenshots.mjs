/**
 * Takes the screenshots that go in the manual.
 *
 * Against the running application with the seeded school in it, so what the
 * manual shows is what the software does. Drawn mock-ups would have been
 * quicker and would have started drifting from the product the day after they
 * were made; a screenshot that is wrong is at least wrong in a way somebody
 * notices.
 *
 * Uses the browser already on the machine through puppeteer-core rather than
 * downloading one. It is a development tool and is not part of the build.
 *
 *   node scripts/dev-db.mjs      in one terminal
 *   npx next start               in another (a production build is far lighter)
 *   node scripts/screenshots.mjs <session-token>
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import puppeteer from "puppeteer-core";

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error("Usage: node scripts/screenshots.mjs <session-token>");
  process.exit(1);
}

const BASE = process.env.SHOT_BASE ?? "http://127.0.0.1:3000";
const OUT = join(process.cwd(), "docs", "screenshots");

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const executablePath = process.env.CHROME_PATH ?? BROWSERS.find((path) => existsSync(path));
if (!executablePath) {
  console.error("No browser found. Set CHROME_PATH.");
  process.exit(1);
}

/**
 * What to photograph.
 *
 * `name` becomes the file name and the caption key in the manual. `wait` is a
 * selector that has to appear before the shutter goes: a screenshot taken
 * before the table has rendered is a photograph of a spinner, and it looks
 * exactly like a screenshot of a broken screen.
 */
const SHOTS = [
  ["sign-in", "/login", { full: false, anonymous: true }],
  ["dashboard", "/dashboard", {}],
  [
    // The one screen worth staging. A cafeteria page photographed before
    // anybody opens the sitting shows an empty room, and the thing this module
    // exists for, the allergy warning at the counter, is invisible in it.
    "cafeteria-serving",
    "/cafeteria",
    {
      async act(page) {
        const opened = await page.evaluate(() => {
          const button = [...document.querySelectorAll("button")].find((element) =>
            element.textContent?.includes("Open this sitting"),
          );
          if (!button) return false;
          button.click();
          return true;
        });
        if (opened) await new Promise((resolve) => setTimeout(resolve, 3500));

        // Type into the counter's search so the queue, the entitlement badges
        // and any allergy warning are on screen. Three letters of a common
        // Ghanaian surname rather than one character: the search wants two
        // before it runs, and a single letter would return the whole school.
        const box = await page.$('input[aria-label="Find the person to serve"]');
        if (box) {
          await box.type("men", { delay: 80 });
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      },
    },
  ],
  ["students", "/students", {}],
  ["student-profile", "@student", {}],
  ["cover", "/cover", {}],
  ["attendance", "/attendance", {}],
  ["gradebook", "/gradebook", {}],
  ["report-cards", "/reports/cards", {}],
  ["invoices", "/finance/invoices", {}],
  ["fee-statement", "/finance/statement", {}],
  ["ledger", "/finance/ledger", {}],
  ["expenses", "/finance/expenses", {}],
  ["payroll", "/payroll", {}],
  ["cafeteria-counter", "/cafeteria", {}],
  ["cafeteria-menu", "/cafeteria/menu", {}],
  ["cafeteria-plans", "/cafeteria/plans", {}],
  ["alumni", "/alumni", {}],
  ["boarding", "/boarding", {}],
  ["assets", "/assets", {}],
  ["store", "/stores", {}],
  ["admissions", "/admissions", {}],
  ["exams", "/exams", {}],
  ["library", "/library", {}],
  ["transport", "/transport", {}],
  ["communications", "/communications/compose", {}],
  ["guardians", "/guardians", {}],
  ["staff", "/staff", {}],
  ["roles", "/users/roles", {}],
  ["settings", "/settings/school", {}],
  ["integrations", "/settings/integrations", {}],
  ["guardian-portal", "/portal/guardian", {}],
  ["student-portal", "/portal/student", {}],
];

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb"],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
});

const page = await browser.newPage();

/*
 * The install and notification prompts, dismissed before anything is
 * photographed.
 *
 * They are correct behaviour, and they would sit in the corner of every
 * screenshot in the manual, teaching a reader that a box they should be able
 * to close is part of the screen. Setting the same keys their buttons set is
 * dismissing them rather than hiding them.
 */
await page.evaluateOnNewDocument(() => {
  try {
    window.localStorage.setItem("pwa:install-dismissed", "1");
    window.localStorage.setItem("pwa:push-dismissed", "1");
  } catch {
    // Storage blocked. The prompts appear; nothing to be done from here.
  }
});

await browser.setCookie({
  name: "sms_session",
  value: TOKEN,
  domain: "127.0.0.1",
  path: "/",
});

/** The one dynamic address: a real pupil, found the way a person would. */
async function studentPath() {
  await page.goto(`${BASE}/students`, { waitUntil: "networkidle2", timeout: 120_000 });
  const href = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a[href]")]
      .map((link) => link.getAttribute("href") ?? "")
      .filter((value) => /^\/students\/[a-z0-9]{20,}$/.test(value));
    return links[0] ?? null;
  });
  return href ?? "/students";
}

const resolved = new Map([["@student", await studentPath()]]);

let taken = 0;
const failed = [];

for (const [name, where, options] of SHOTS) {
  const path = resolved.get(where) ?? where;

  try {
    await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 120_000 });

    // Charts animate in and tables settle. A moment here is the difference
    // between a screenshot of the software and a screenshot of it loading.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    if (options.act) await options.act(page);

    await page.screenshot({
      path: join(OUT, `${name}.png`),
      fullPage: options.full ?? false,
    });

    taken += 1;
    console.log(`  ${name.padEnd(22)} ${path}`);
  } catch (error) {
    failed.push([name, path, String(error.message).slice(0, 100)]);
    console.log(`  FAILED ${name.padEnd(15)} ${path}  ${String(error.message).slice(0, 80)}`);
  }
}

await browser.close();

console.log(`\n  ${taken} screenshots in docs/screenshots.`);
if (failed.length) {
  console.log(`  ${failed.length} failed:`);
  for (const [name, path, why] of failed) console.log(`    ${name} ${path} ${why}`);
  process.exit(1);
}
