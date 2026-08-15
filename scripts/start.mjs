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
  try {
    const url = new URL(process.env.DATABASE_URL);
    target = `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    // Leave the placeholder — a malformed URL is itself the diagnosis.
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
  }
}

// -----------------------------------------------------------------------------
// 2. Web server
// -----------------------------------------------------------------------------

const port = process.env.PORT ?? "3000";
// Bind all interfaces explicitly — a container that binds loopback only will
// build, boot, log nothing unusual, and still fail every health check.
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

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

// Forward shutdown signals so deploys drain cleanly instead of being killed.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
