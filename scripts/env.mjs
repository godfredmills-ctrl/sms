/**
 * NODE_ENV normalisation, shared by the build and start entrypoints.
 *
 * Pasting a `.env`-style block into a hosting dashboard is the normal way
 * people configure a deploy, and `NODE_ENV="production"` arrives with its
 * quotes intact. Next.js then reports only:
 *
 *     ⚠ You are using a non-standard "NODE_ENV" value
 *
 * and, when a warm build cache from a previous NODE_ENV is present, fails
 * with `<Html> should not be imported outside of pages/_document` while
 * prerendering /404 — an error that says nothing about the real cause.
 *
 * Rather than let that through, normalise the value before Next ever sees it.
 */

const STANDARD = new Set(["development", "production", "test"]);

export function normaliseNodeEnv({ fallback = "production" } = {}) {
  const raw = process.env.NODE_ENV;
  if (raw === undefined) return { changed: false, value: undefined };

  // Strip surrounding quotes and stray whitespace, then lowercase.
  const cleaned = raw.trim().replace(/^["']|["']$/g, "").trim().toLowerCase();

  // An empty value means the variable exists but says nothing — that is
  // "unset" in intent, not a mistake. Correct it quietly; Next would
  // otherwise reject it, but a full warning on every boot would be noise.
  if (cleaned === "") {
    process.env.NODE_ENV = fallback;
    console.log(`  NODE_ENV was empty; using ${JSON.stringify(fallback)}.`);
    return { changed: true, value: fallback };
  }

  if (cleaned === raw && STANDARD.has(cleaned)) {
    return { changed: false, value: cleaned };
  }

  const value = STANDARD.has(cleaned) ? cleaned : fallback;

  console.warn(
    [
      "",
      "  NODE_ENV was not a standard value and has been corrected.",
      `    received: ${JSON.stringify(raw)}`,
      `    using:    ${JSON.stringify(value)}`,
      "",
      "  Next.js only accepts development | production | test. A quoted value",
      "  (NODE_ENV=\"production\") is the usual cause — it keeps its quotes.",
      "  Delete NODE_ENV from your host's variables; the platform sets it.",
      "",
    ].join("\n"),
  );

  process.env.NODE_ENV = value;
  return { changed: true, value };
}

/** Resolves a package's executable so it can be run with the current Node. */
export async function binOf(specifier) {
  const { fileURLToPath } = await import("node:url");
  return fileURLToPath(import.meta.resolve(specifier));
}
