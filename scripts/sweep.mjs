/**
 * Opens every page as an administrator and reports what breaks.
 *
 * The ten build guards catch what can be checked without running anything.
 * This catches the rest: a query that type-checks and throws, a page that
 * renders a value its component cannot handle, a route that exists in the
 * navigation and 404s. Until there was a database on this machine none of that
 * could be checked at all.
 *
 *   node scripts/dev-db.mjs      in one terminal
 *   npm run dev                  in another
 *   node scripts/sweep.mjs <session-token>
 *
 * Two things it has to be careful about, both learned the hard way.
 *
 * The id. Substituting one id into every dynamic route makes /alumni/<a
 * student id> 404 correctly and report as a failure, which buries the real
 * ones. Each route family gets its own id, scraped from its own list page: an
 * id that appears in a link is one a person could click, which is a better
 * test than one read out of the database.
 *
 * The restart. `next dev` restarts itself when it approaches its memory
 * threshold, and compiling 167 routes in one process reaches it. Everything
 * after that point fails to connect, which looks like the application falling
 * over and is the development server doing exactly what it says. So a failed
 * connection waits and retries rather than being reported.
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error("Usage: node scripts/sweep.mjs <session-token>");
  process.exit(1);
}

const BASE = process.env.SWEEP_BASE ?? "http://127.0.0.1:3000";
const APP = join(process.cwd(), "src", "app");
const COOKIE = { cookie: `sms_session=${TOKEN}` };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Every page route, read off the filesystem rather than a hand-kept list.
 *
 * A hand-kept list goes out of date the first time somebody adds a page, and a
 * sweep that silently stops covering new work is worse than no sweep: it
 * reports green over ground it never walked.
 */
function routes(dir, prefix = "") {
  const found = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      // (groups) do not appear in the URL. @slots and _private are not routes.
      if (entry.startsWith("@") || entry.startsWith("_")) continue;
      const segment = entry.startsWith("(") && entry.endsWith(")") ? "" : `/${entry}`;
      found.push(...routes(path, prefix + segment));
      continue;
    }

    if (entry === "page.tsx" || entry === "page.ts") found.push(prefix || "/");
  }

  return found;
}

// ---------------------------------------------------------------------------
// Fetching, with patience
// ---------------------------------------------------------------------------

async function open(path, attempt = 1) {
  const started = Date.now();

  try {
    const response = await fetch(BASE + path, {
      headers: COOKIE,
      redirect: "manual",
      signal: AbortSignal.timeout(180_000),
    });

    const body = response.status >= 400 ? await response.text() : "";
    return {
      path,
      status: response.status,
      ms: Date.now() - started,
      location: response.headers.get("location"),
      // Next prints the thrown message into the error page in development.
      hint: body
        ? (/<h2[^>]*>([^<]{0,200})/.exec(body)?.[1] ??
           /"message":"([^"]{0,200})/.exec(body)?.[1] ??
           "")
        : "",
    };
  } catch (error) {
    // The development server restarting is not the application failing. It
    // comes back in a couple of seconds; anything still refusing after three
    // tries is worth reporting.
    if (attempt < 4) {
      await sleep(attempt * 4000);
      return open(path, attempt + 1);
    }
    return { path, status: 0, ms: Date.now() - started, hint: String(error.message) };
  }
}

async function bodyOf(path) {
  try {
    const response = await fetch(BASE + path, {
      headers: COOKIE,
      signal: AbortSignal.timeout(180_000),
    });
    return await response.text();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Ids, one family at a time
// ---------------------------------------------------------------------------

/**
 * Where to find an id for each route family.
 *
 * The key is the route prefix the id belongs to; the value is the list page to
 * scrape and the shape of a link to one of its records. A family with no entry
 * here is skipped and reported as skipped, which is honest, rather than swept
 * with a borrowed id and reported as broken.
 */
const FAMILIES = [
  ["/students", "/students", /href="\/students\/([a-z0-9]{20,})/],
  ["/guardians", "/guardians", /href="\/guardians\/([a-z0-9]{20,})/],
  ["/staff", "/staff", /href="\/staff\/([a-z0-9]{20,})/],
  ["/alumni", "/alumni", /href="\/alumni\/([a-z0-9]{20,})/],
  ["/assets", "/assets", /href="\/assets\/([a-z0-9]{20,})/],
  ["/stores", "/stores", /href="\/stores\/([a-z0-9]{20,})/],
  ["/transport", "/transport", /href="\/transport\/([a-z0-9]{20,})/],
  ["/library", "/library", /href="\/library\/([a-z0-9]{20,})/],
  ["/lms", "/lms", /href="\/lms\/([a-z0-9]{20,})/],
  ["/exams", "/exams", /href="\/exams\/([a-z0-9]{20,})/],
  ["/payroll", "/payroll", /href="\/payroll\/([a-z0-9]{20,})/],
  ["/letters", "/letters", /href="\/letters\/([a-z0-9]{20,})/],
  ["/gradebook", "/gradebook", /href="\/gradebook\/([a-z0-9]{20,})/],
  ["/elections", "/elections", /href="\/elections\/([a-z0-9][a-z0-9-]{3,})/],
  ["/website/pages", "/website", /href="\/website\/pages\/([a-z0-9]{20,})/],
  ["/finance/invoices", "/finance/invoices", /href="\/finance\/invoices\/([a-z0-9]{20,})/],
  ["/finance/payments", "/finance/payments", /href="\/finance\/payments\/([a-z0-9]{20,})/],
  ["/finance/expenses", "/finance/expenses", /href="\/finance\/expenses\/([a-z0-9]{20,})/],
  ["/finance/ledger/accounts", "/finance/ledger/accounts", /href="\/finance\/ledger\/accounts\/([a-z0-9]{20,})/],
  ["/finance/ledger", "/finance/ledger", /href="\/finance\/ledger\/([a-z0-9]{20,})/],
  ["/reports/cards", "/reports/cards", /href="\/reports\/cards\/([a-z0-9]{20,})/],
  ["/credentials/certificates", "/credentials", /href="\/credentials\/certificates\/([a-z0-9]{20,})/],
  ["/credentials/transcripts", "/credentials", /href="\/credentials\/transcripts\/([a-z0-9]{20,})/],
  ["/credentials/templates", "/credentials/templates", /href="\/credentials\/templates\/([a-z0-9]{20,})/],
];

/** Segments that are never an id: a public slug, a reset token. */
const LITERALS = { "[...slug]": "home", "[token]": "sample-token" };

const found = new Map();

async function discover() {
  const pages = new Map();

  for (const [family, from, pattern] of FAMILIES) {
    if (!pages.has(from)) pages.set(from, await bodyOf(from));
    const match = pattern.exec(pages.get(from) ?? "");
    if (match) found.set(family, match[1]);
  }
}

/** The id belonging to the longest matching family prefix. */
function idFor(route) {
  let best = null;
  for (const [family, id] of found) {
    if (route.startsWith(family) && (!best || family.length > best.family.length)) {
      best = { family, id };
    }
  }
  return best?.id ?? null;
}

function fill(route) {
  if (!route.includes("[")) return route;

  let filled = route;
  for (const [segment, value] of Object.entries(LITERALS)) {
    filled = filled.replaceAll(segment, value);
  }
  if (!filled.includes("[")) return filled;

  const id = idFor(route);
  if (!id) return null;

  return filled.replace(/\[[^\]]+\]/g, id);
}

// ---------------------------------------------------------------------------

const all = [...new Set(routes(APP))].sort();
const skipped = [];
const results = [];

await discover();

console.log(`\n  Sweeping ${all.length} routes`);
console.log(`  Ids found for ${found.size} of ${FAMILIES.length} route families\n`);

for (const route of all) {
  const path = fill(route);
  if (!path) {
    skipped.push(route);
    console.log(`  skip      ${" ".repeat(9)}${route}  no record to open`);
    continue;
  }

  const result = await open(path);
  result.route = route;
  results.push(result);

  const good = result.status === 200 || (result.status >= 300 && result.status < 400);
  const detail = result.hint ? `  ${result.hint.slice(0, 120)}` : "";
  console.log(
    `  ${good ? "ok  " : "FAIL"} ${String(result.status).padEnd(4)} ${String(result.ms).padStart(6)}ms  ${path}${detail}`,
  );
}

const broken = results.filter(
  (r) => !(r.status === 200 || (r.status >= 300 && r.status < 400)),
);

console.log(`\n  ${results.length - broken.length} of ${results.length} opened.`);
if (skipped.length) {
  console.log(`  ${skipped.length} skipped for want of a record: ${skipped.join(", ")}`);
}

writeFileSync("sweep-report.json", JSON.stringify({ results, skipped, broken }, null, 2));

if (broken.length) {
  console.log(`\n  ${broken.length} broken:\n`);
  for (const result of broken) {
    console.log(`    ${result.status}  ${result.path}\n        ${result.hint}`);
  }
  process.exit(1);
}

console.log("  Nothing broken.\n");
