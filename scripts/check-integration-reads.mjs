#!/usr/bin/env node
/**
 * Provider credentials must come from the resolver, never from `env` directly.
 *
 * This guard exists because the failure it prevents is silent. A school types
 * an Arkesel key into the settings screen; it is stored, the page shows it as
 * configured, and a sender still reading `env.sms.arkeselKey` sends nothing —
 * or worse, goes on sending through the old provider. Nothing throws. Nothing
 * is logged. The school finds out when a parent says they were never told
 * about the fees deadline.
 *
 * `src/lib/integrations/**` is allowed to read the environment: that is the
 * module whose whole job is to decide between the environment and the stored
 * value. `src/lib/env.ts` defines the accessors. Everywhere else, a read of
 * one of these fields is the bug.
 *
 * Storage is deliberately absent from the banned list — it stays
 * deployment-only, for the reason given in the catalogue.
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SEARCH_ROOTS = ["src", "scripts"];

/**
 * Two ways to read a credential from the environment, both banned.
 *
 * The first is what the code used to do, and is now also a type error since
 * those groups were removed from `env.ts` — kept here because a named reason
 * beats "property does not exist on type".
 *
 * The second is the one nothing else would catch: `process.env.ARKESEL_API_KEY`
 * typechecks perfectly, reads half the answer, and is exactly what someone in
 * a hurry writes.
 */
const BANNED_GROUP = /\benv\s*\.\s*(sms|payments|email|push|ai)\b/;

/** Every key the settings screen can store, read from the catalogue itself. */
const catalogue = readFileSync(
  path.join(ROOT, "src", "lib", "integrations", "catalogue.ts"),
  "utf8",
);
const STORED_KEYS = [...catalogue.matchAll(/key:\s*"([A-Z0-9_]+)"/g)].map(
  (match) => match[1],
);

if (STORED_KEYS.length < 10) {
  console.error(
    `Read only ${STORED_KEYS.length} keys out of the catalogue: the guard is not seeing it. Has the field shape changed?`,
  );
  process.exit(1);
}

const BANNED_PROCESS_ENV = new RegExp(
  `process\\s*\\.\\s*env\\s*(\\.\\s*(${STORED_KEYS.join("|")})\\b|\\[\\s*["'\`](${STORED_KEYS.join("|")})["'\`]\\s*\\])`,
);

const ALLOWED = [
  path.join("src", "lib", "integrations"),
  path.join("src", "lib", "env.ts"),
  // This guard names the fields in order to ban them.
  path.join("scripts", "check-integration-reads.mjs"),
  // The setup CLI runs before the app and has no database — reading the
  // environment is the whole point of it.
  path.join("scripts", "setup-integrations.mjs"),
];

function isAllowed(file) {
  return ALLOWED.some((allowed) => file === allowed || file.startsWith(allowed + path.sep));
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(path.join(ROOT, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      yield* walk(relative);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      yield relative;
    }
  }
}

const offences = [];

for (const root of SEARCH_ROOTS) {
  for await (const file of walk(root)) {
    if (isAllowed(file)) continue;

    const lines = readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (BANNED_GROUP.test(line) || BANNED_PROCESS_ENV.test(line)) {
        offences.push({ file, line: index + 1, text: line.trim() });
      }
    });
  }
}

if (offences.length) {
  console.error(
    "\nProvider credentials must be read through integrationConfig(), not from env:\n",
  );
  for (const offence of offences) {
    console.error(`  ${offence.file}:${offence.line}`);
    console.error(`    ${offence.text}`);
  }
  console.error(
    "\nUse `const { sms } = await integrationConfig()` from @/lib/integrations/config.",
  );
  console.error(
    "The environment still wins where it is set: the resolver is what applies that rule.\n",
  );
  process.exit(1);
}

console.log("  integration reads: all provider credentials go through the resolver");
