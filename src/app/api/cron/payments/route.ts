import { NextResponse } from "next/server";

import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { reconcilePendingPayments } from "@/lib/payments/settle";

export const maxDuration = 300;

/**
 * Payment reconciliation.
 *
 * Asks the provider what became of every checkout that was started and never
 * confirmed. Point a scheduler at this every fifteen minutes or so once real
 * money is being taken.
 *
 * Without it, a webhook is the only thing that can credit an account — and a
 * webhook is a request from somebody else's server that can be lost while the
 * app redeploys, refused during a database blip, or never sent at all because
 * the URL was not entered in the provider's dashboard. Each of those leaves a
 * parent charged with their invoice still outstanding, and the reminder rules
 * then chase them for money they have already paid. This is the safety net
 * under that.
 *
 * Safe to run as often as you like: settlement is idempotent, and a payment
 * that is already SUCCESS is left alone.
 */
export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const counts = await reconcilePendingPayments();
    return NextResponse.json({ ok: true, ...counts, durationMs: Date.now() - startedAt });
  } catch (error) {
    console.error("[cron:payments] failed", error);
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
