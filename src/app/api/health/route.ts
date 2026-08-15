import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Railway health check. Confirms the process is up *and* the database answers. */
export async function GET() {
  const startedAt = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "connected",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        database: "unreachable",
        error: (error as Error).message,
      },
      { status: 503 },
    );
  }
}
