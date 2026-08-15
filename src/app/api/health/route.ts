import { NextResponse } from "next/server";

import { db } from "@/lib/db";
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
    const dir = process.env.STORAGE_LOCAL_DIR ?? "./storage/uploads";
    const ephemeral = !dir.startsWith("/");
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

    // A reachable database that has no tables means migrations have not run.
    const [{ count }] = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;

    const migrated = Number(count) > 0;

    return NextResponse.json({
      status: migrated ? "ok" : "degraded",
      database: "connected",
      migrations: migrated ? "applied" : "pending",
      ...(migrated
        ? {}
        : {
            hint: "The database is reachable but has no tables. Check the deploy logs for migration errors, or run `npx prisma migrate deploy`.",
          }),
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
