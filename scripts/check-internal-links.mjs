/**
 * Refuses a build containing a link or redirect to a path this app does not
 * serve.
 *
 * Written after two of them were found in one sweep, one of them serious:
 *
 *   redirect("/account/password?first=1")   — src/app/(auth)/login/actions.ts
 *
 * Every account this system creates is born with mustChangePassword set, so
 * that line was the first screen every new user ever saw. There is no
 * /account/password route; the password form is a card on /account. The path
 * fell through to the signed-in catch-all, which politely said nothing is
 * served there — and the forced password change, never reached, was never
 * made. The temporary password stayed live.
 *
 * A catch-all route is exactly why this needs checking mechanically: it means
 * a wrong path never 404s in the way a wrong path normally announces itself.
 * It renders a tidy page and the mistake looks like a decision.
 *
 * Only fully-literal paths are checked. A template literal carrying an id
 * (`/students/${id}`) is matched on its static prefix, so the segment that
 * varies is never guessed at.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP = join("src", "app");

// -----------------------------------------------------------------------------
// What the app actually serves
// -----------------------------------------------------------------------------

/**
 * Every routable path, as a matcher. Route groups — the (app), (auth) folders
 * — are organisational and contribute no URL segment. A [param] matches one
 * segment; a [...slug] matches the rest.
 */
function collectRoutes(dir, segments = []) {
  const routes = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return routes;
  }

  const servesAPage = entries.some((entry) => /^(page|route)\.tsx?$/.test(entry));
  if (servesAPage) routes.push([...segments]);

  for (const entry of entries) {
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) continue;
    if (entry.startsWith("_")) continue; // private folders are not routes
    if (entry.startsWith("(") && entry.endsWith(")")) {
      routes.push(...collectRoutes(path, segments)); // route group: no segment
    } else {
      routes.push(...collectRoutes(path, [...segments, entry]));
      // An optional catch-all — [[...path]] — also serves its own parent, so
      // /site is a real page even though the only file lives one level down.
      if (entry.startsWith("[[...") && entry.endsWith("]]")) {
        routes.push([...segments]);
      }
    }
  }
  return routes;
}

const ROUTES = collectRoutes(APP);

/** The catch-all is the app's "nothing here" page; matching it is not a match. */
const REAL_ROUTES = ROUTES.filter((segments) => !segments.some((s) => s.startsWith("[...")));

function matches(routeSegments, pathSegments) {
  if (routeSegments.length !== pathSegments.length) return false;
  return routeSegments.every(
    (segment, index) =>
      (segment.startsWith("[") && segment.endsWith("]")) || segment === pathSegments[index],
  );
}

/**
 * A literal path resolves if some route matches it exactly. A prefix (from a
 * template literal) resolves if some route *starts* with it — the rest of
 * that route is the part the template fills in.
 */
function resolves(path, isPrefix) {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return true; // "/" — the root
  if (!isPrefix) return REAL_ROUTES.some((route) => matches(route, segments));
  return REAL_ROUTES.some(
    (route) =>
      route.length >= segments.length &&
      matches(route.slice(0, segments.length), segments),
  );
}

// -----------------------------------------------------------------------------
// What the app links to
// -----------------------------------------------------------------------------

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/**
 * Paths that legitimately leave the Next router: files served from /public,
 * and the manifest/icon paths the browser fetches directly.
 */
const NOT_ROUTES = [/^\/icons?\//, /^\/images?\//, /^\/manifest/, /^\/favicon/, /^\/sw\.js/, /\.(png|jpe?g|svg|ico|webmanifest|json|txt|xml|css|js)$/];

const LINK_PATTERNS = [
  { pattern: /\bhref="(\/[^"#?]*)/g, kind: "href" },
  { pattern: /\bhref=\{`(\/[^`$?#]*)/g, kind: "href" },
  { pattern: /\bredirect\("(\/[^"#?]*)/g, kind: "redirect" },
  { pattern: /\bredirect\(`(\/[^`$?#]*)/g, kind: "redirect" },
  { pattern: /\brouter\.(?:push|replace)\("(\/[^"#?]*)/g, kind: "router" },
  { pattern: /window\.location\.href\s*=\s*`(\/[^`$?#]*)/g, kind: "navigation" },
  { pattern: /window\.location\.href\s*=\s*"(\/[^"#?]*)/g, kind: "navigation" },
  // window.open was missing from this list, and that is how a "Print ID cards"
  // button pointing at /print/id-cards survived in the students table: a route
  // that has never existed in this application, opened in a new tab, showing a
  // 404 to whoever pressed it. A link is a link whichever function opens it.
  { pattern: /window\.open\(`(\/[^`$?#]*)/g, kind: "window.open" },
  { pattern: /window\.open\("(\/[^"#?]*)/g, kind: "window.open" },
];

/** A path is a prefix when what followed it in the source was an interpolation. */
const problems = [];

for (const file of sourceFiles("src")) {
  const source = readFileSync(file, "utf8");

  for (const { pattern, kind } of LINK_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      let path = match[1];
      if (!path.startsWith("/")) continue;
      if (NOT_ROUTES.some((skip) => skip.test(path))) continue;

      // Did an interpolation follow? Then we only know a prefix.
      const after = source.slice(match.index + match[0].length, match.index + match[0].length + 2);
      const isPrefix = after.startsWith("${") || path.endsWith("/");
      path = path.replace(/\/$/, "");
      if (path === "") continue;

      if (!resolves(path, isPrefix)) {
        problems.push({
          file: relative(".", file),
          line: source.slice(0, match.index).split("\n").length,
          path: match[1],
          kind,
        });
      }
    }
  }
}

if (problems.length === 0) {
  console.log(`  ok  Every internal link resolves (${REAL_ROUTES.length} routes).`);
  process.exit(0);
}

const rule = "─".repeat(72);
console.error(`\n${rule}`);
console.error("  A link or redirect points at a path this app does not serve");
console.error(rule);
console.error(
  "\n  These do not 404 visibly: the signed-in catch-all renders a tidy",
);
console.error('  "nothing is served here" page, so a wrong path looks deliberate.\n');

for (const problem of problems) {
  console.error(`    ${problem.file}:${problem.line}`);
  console.error(`      ${problem.kind} -> ${problem.path}`);
}
console.error("");
console.error(`${rule}\n`);
process.exit(1);
