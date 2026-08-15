import { NextResponse } from "next/server";

import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { markOverdueInvoices } from "@/lib/finance";
import { runFeeReminders } from "@/lib/messaging";

export const maxDuration = 300;

/**
 * Scheduled fee reminders.
 *
 * Point a Railway cron (or any scheduler) at this endpoint hourly with the
 * shared secret in the Authorization header. The reminder rules themselves
 * decide what actually goes out, including quiet hours.
 */
export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const overdue = await markOverdueInvoices();
    const reminders = await runFeeReminders();

    return NextResponse.json({
      ok: true,
      markedOverdue: overdue,
      ...reminders,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[cron:reminders] failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

/** GET is allowed too, since some schedulers only issue GET requests. */
export const GET = POST;

function authorised(request: Request): boolean {
  if (!env.cronSecret) return false;

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  const fromQuery = new URL(request.url).searchParams.get("secret") ?? "";

  return safeEqual(token, env.cronSecret) || safeEqual(fromQuery, env.cronSecret);
}
