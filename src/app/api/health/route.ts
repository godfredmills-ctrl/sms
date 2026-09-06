import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { migrationStatus, type MigrationRow } from "@/lib/migration-status";
import { isS3, s3ConfigProblems } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Storage is reported without touching the network.
 *
 * A HeadBucket on every health check would add a round trip to a check the
 * platform runs constantly, and would fail the check when the object store has
 * a bad minute — which is the same mistake as tying health to the database.
 * Configuration problems are the ones worth reporting here; connectivity is
 * verified on the integrations page, on demand.
 */
function storageStatus() {
  if (!isS3()) {
    // Through env, and with the same absolute-path test the storage module
    // uses. Read straight from process.env this missed the trimming and the
    // empty-string fallback that env applies, and `startsWith("/")` called a
    // perfectly good Windows path ephemeral — so a developer's health check
    // and their integrations page disagreed about the same directory.
    const dir = env.storage.localDir;
    const ephemeral = !path.isAbsolute(dir);
    return {
      driver: "local",
      ok: true,
      ...(ephemeral
        ? {
            warning: `Uploads are written to ${dir} inside the container and are lost on every redeploy. Attach a volume and set STORAGE_LOCAL_DIR to its mount path, or switch to STORAGE_DRIVER=s3.`,
          }
        : {}),
    };
  }

  const problems = s3ConfigProblems();
  return {
    driver: "s3",
    ok: problems.length === 0,
    ...(problems.length ? { error: problems.join("; ") } : {}),
  };
}

/**
 * Prisma prefixes its errors with blank lines and the failed invocation, so
 * taking `.split("\n")[0]` yields an empty string. Take the first line that
 * actually says something.
 */
function firstMeaningfulLine(message: string): string {
  const line = message
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0 && !entry.startsWith("Invalid `"));
  return line ?? message.trim().slice(0, 200);
}

/**
 * The migrations this build ships, from the image itself.
 *
 * Not standalone output, and the start script runs `prisma migrate deploy` from
 * the repository root, so this directory is present wherever the server runs.
 * Null rather than an empty array when it cannot be read: an empty list would
 * mean "this build ships no migrations", and every applied migration would then
 * look like a database running ahead of the code. A directory that is missing
 * and a directory that is empty are different facts.
 */
function migrationsOnDisk(): string[] | null {
  try {
    return fs
      .readdirSync(path.join(process.cwd(), "prisma", "migrations"), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return null;
  }
}

/**
 * What the database says it has applied.
 *
 * Existence is tested with to_regclass rather than by querying the table and
 * catching the error. A failed statement leaves some drivers unwilling to take
 * the next one on the same connection — PGlite in particular wedges and then
 * reports every later query as an unreachable database, which would turn this
 * endpoint into a liar in the other direction.
 */
async function appliedMigrations(): Promise<MigrationRow[] | null> {
  const [{ present }] = await db.$queryRaw<Array<{ present: boolean }>>`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present
  `;
  if (!present) return null;

  const rows = await db.$queryRaw<
    Array<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>
  >`
    SELECT "migration_name", "finished_at", "rolled_back_at"
    FROM "_prisma_migrations"
  `;

  return rows.map((row) => ({
    name: row.migration_name,
    finished: row.finished_at !== null,
    rolledBack: row.rolled_back_at !== null,
  }));
}

/**
 * Health check.
 *
 * Deliberately returns 200 whenever the process is serving traffic, and
 * reports the database separately in the body.
 *
 * Tying the platform's health check to the database means a slow or briefly
 * unreachable Postgres fails the deploy outright — and the operator is shown
 * "service unavailable" with no indication of why. Answering 200 with
 * `database: "unreachable"` plus the driver's own message turns that into a
 * diagnosis you can read.
 *
 * The migration state is a real comparison, not a proxy for one. This endpoint
 * used to answer it by counting tables and reporting "applied" for any count
 * above zero, which meant a deployment nine migrations and seventeen tables
 * behind its own code reported perfect health. See src/lib/migration-status.ts.
 */
export async function GET() {
  const startedAt = Date.now();

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      status: "degraded",
      database: "not_configured",
      hint: "DATABASE_URL is not set. On Railway, add a PostgreSQL service and set DATABASE_URL=${{Postgres.DATABASE_URL}} on this service.",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    await db.$queryRaw`SELECT 1`;

    const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;

    const migrations = migrationStatus({
      onDisk: migrationsOnDisk(),
      rows: await appliedMigrations(),
    });

    return NextResponse.json({
      status: migrations.healthy ? "ok" : "degraded",
      database: "connected",
      migrations: migrations.state,
      applied: migrations.applied,
      // Named, not merely counted: an operator reading this over SSH needs to
      // know WHICH module is missing, and the names carry that.
      ...(migrations.pending.length ? { pending: migrations.pending } : {}),
      ...(migrations.failed.length ? { failed: migrations.failed } : {}),
      ...(migrations.ahead.length ? { ahead: migrations.ahead } : {}),
      ...(migrations.hint ? { hint: migrations.hint } : {}),
      tables: Number(count),
      storage: storageStatus(),
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      status: "degraded",
      database: "unreachable",
      error: firstMeaningfulLine((error as Error).message),
      hint: "Check that the PostgreSQL service is running and DATABASE_URL is correct.",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  }
}
