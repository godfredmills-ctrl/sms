/**
 * Production entrypoint.
 *
 * Applies pending migrations, then starts Next.
 *
 * The important property here is that a database problem must not stop the web
 * server from listening. Chaining `prisma migrate deploy && next start` means a
 * missing DATABASE_URL, an unreachable Postgres or a bad migration kills the
 * container before it binds a port — the platform then reports only
 * "service unavailable", which says nothing about the actual cause.
 *
 * Instead: migrations run, failures are logged loudly, and the server starts
 * either way so `/api/health` can report exactly what is wrong.
 */

import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { normaliseNodeEnv } from "./env.mjs";

normaliseNodeEnv({ fallback: "production" });

const line = "─".repeat(72);

function banner(title) {
  console.log(`\n${line}\n  ${title}\n${line}`);
}

function fail(title, details) {
  console.error(`\n${line}`);
  console.error(`  ${title}`);
  console.error(line);
  for (const detail of details) console.error(`  ${detail}`);
  console.error(`${line}\n`);
}

// -----------------------------------------------------------------------------
// 1. Migrations
// -----------------------------------------------------------------------------

banner("Starting School Management System");

/** Gates optional seeding — never seed against a schema that failed to apply. */
let migrationsOk = false;

if (!process.env.DATABASE_URL) {
  fail("DATABASE_URL is not set — skipping migrations", [
    "The app will start, but every page that touches the database will fail.",
    "",
    "On Railway: add a PostgreSQL service, then set this variable on the app",
    "service (Variables -> Raw editor):",
    "",
    "    DATABASE_URL=${{Postgres.DATABASE_URL}}",
    "",
    "Check /api/health once deployed — it reports the live database status.",
  ]);
} else {
  // Log the host only. The full URL contains the password.
  let target = "(unparseable DATABASE_URL)";
  let hostname = null;
  try {
    const url = new URL(process.env.DATABASE_URL);
    hostname = url.hostname;
    target = `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    // Leave the placeholder — a malformed URL is itself the diagnosis.
  }

  // Pasting .env.example into a host's variables is a common way to start, and
  // it carries a localhost placeholder that cannot resolve inside a container.
  // Say so plainly rather than leaving "connection refused" to be interpreted.
  if (hostname && /^(localhost|127\.0\.0\.1|::1)$/.test(hostname)) {
    fail("DATABASE_URL points at localhost", [
      "Inside a container, localhost is the container itself — not your",
      "database. This is the placeholder value from .env.example.",
      "",
      "On Railway: add a PostgreSQL service, then set this on the app service",
      "so the two stay linked:",
      "",
      "    DATABASE_URL=${{Postgres.DATABASE_URL}}",
      "",
      "Paste that reference literally — Railway resolves it at deploy time.",
    ]);
  }

  console.log(`  Applying migrations to ${target}`);

  const migrate = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.resolve("prisma/build/index.js")), "migrate", "deploy"],
    { stdio: "inherit", env: process.env },
  );

  if (migrate.status !== 0) {
    fail(`Migrations failed (exit code ${migrate.status})`, [
      "The server will still start so you can reach /api/health, but the app",
      "will not work correctly until this is resolved.",
      "",
      "Common causes:",
      "  - The database is still provisioning; redeploy in a minute.",
      "  - DATABASE_URL points at a database this user cannot create tables in.",
      "  - A migration conflicts with tables that already exist. Inspect with",
      "    `npx prisma migrate status`.",
    ]);
  } else {
    console.log("  Migrations applied.\n");
    migrationsOk = true;
  }
}

// -----------------------------------------------------------------------------
// 2. Permissions
// -----------------------------------------------------------------------------

/**
 * The seed writes the permission catalogue once, on an empty database, and
 * never revisits it. Without this step every permission added after a
 * school's first deploy stays in the source only: the row is never inserted,
 * no role holds it, and the page it guards is unreachable by everyone but
 * the system administrator. Features shipped and did not appear.
 *
 * Additive only — see src/lib/permission-sync.ts for why reconciling a role
 * against its preset would be worse than the gap it closes.
 */
if (migrationsOk) {
  banner("Syncing the permission catalogue");

  // import.meta.resolve throws rather than returning null, and tsx is a dev
  // dependency: a runtime image built with --omit=dev would take the whole
  // start script down here, before the port is bound — the one failure this
  // file exists to prevent. An unsynced permission is a feature nobody can
  // reach yet; a container that never listens is a school that cannot take
  // a payment.
  let tsxCli = null;
  try {
    tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
  } catch {
    fail("tsx is not installed — skipping the permission sync", [
      "This runtime image has no dev dependencies. The app will start, but a",
      "permission added since this database was seeded cannot be granted yet.",
      "",
      "Run it by hand once against the database:",
      "",
      "    npm run db:sync-permissions",
    ]);
  }

  if (tsxCli) {
    const sync = spawnSync(process.execPath, [tsxCli, "scripts/sync-permissions.ts"], {
      stdio: "inherit",
      env: process.env,
    });
    if (sync.status !== 0) {
      fail("Permission sync did not complete", [
        "The server will still start. Any permission added since this database",
        "was seeded may not be grantable yet — check /users/roles.",
      ]);
    }
  }

  console.log("");
}

/**
 * Optional first-run seeding.
 *
 * A managed database is usually reachable only from inside the platform's
 * private network, which leaves no way to seed a fresh deployment without
 * exposing it publicly. Setting SEED_ON_BOOT=true lets the container do it
 * itself.
 *
 * Runs asynchronously *after* the server is listening. Seeding a full demo
 * school takes minutes, and doing it before the port is bound would fail the
 * platform's health check for the same reason chaining migrations to the start
 * command did.
 *
 * Safe by construction: the seed exits without writing when any user already
 * exists, so leaving the flag on cannot overwrite a live school. Remove it
 * once the first deploy has run.
 */
function seedInBackground() {
  if (process.env.SEED_ON_BOOT !== "true") return;

  banner("SEED_ON_BOOT is set — seeding if the database is empty");
  console.log("  Running behind the server; the site is already accepting requests.\n");

  const seed = spawn(
    process.execPath,
    [fileURLToPath(import.meta.resolve("tsx/cli")), "prisma/seed.ts"],
    {
      stdio: "inherit",
      // The guard lives in the seed itself so a manual `npm run db:seed`
      // keeps its normal, deliberate wipe-and-rebuild behaviour.
      env: { ...process.env, SEED_ONLY_IF_EMPTY: "true" },
    },
  );

  seed.on("exit", (code) => {
    if (code === 0) {
      console.log("\n  Seeding step complete. Remove SEED_ON_BOOT when you are done.\n");
    } else {
      fail(`Seeding failed (exit code ${code})`, [
        "The server is unaffected and existing data was not modified.",
      ]);
    }
  });
}

// -----------------------------------------------------------------------------
// 3. Web server
// -----------------------------------------------------------------------------

const port = process.env.PORT ?? "3000";

/**
 * Bind address.
 *
 * Deliberately NOT read from HOSTNAME: Docker sets that to the container id,
 * so `-H $HOSTNAME` binds one hostname-resolved address rather than every
 * interface. The container then listens, logs a healthy-looking startup, and
 * still fails every health check because the platform's proxy reaches it on a
 * different address.
 *
 * 0.0.0.0 is Next's own default and what hosted platforms expect. HOST is
 * honoured for the rare case of pinning to a specific interface on purpose.
 */
const hostname = process.env.HOST || "0.0.0.0";

console.log(`  Serving on http://${hostname}:${port}\n`);

const server = spawn(
  process.execPath,
  [
    fileURLToPath(import.meta.resolve("next/dist/bin/next")),
    "start",
    "-H",
    hostname,
    "-p",
    port,
  ],
  { stdio: "inherit", env: process.env },
);

// Seed only once the server is listening, so a long seed cannot fail the
// platform's health check.
if (migrationsOk) seedInBackground();

// Forward shutdown signals so deploys drain cleanly instead of being killed.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
