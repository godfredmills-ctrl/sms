import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { fetchSmsDeliveryStatus } from "@/lib/messaging/providers";
import { safeEqual } from "@/lib/crypto";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Reconciles SMS delivery reports with what the school believes it sent.
 *
 * "Sent" only means the aggregator accepted the message. Whether a parent's
 * phone ever rang is a second question the provider answers minutes later,
 * and a fee reminder counted as sent to a dead SIM is a family that was
 * never told. This walks recent SENT recipients, asks the provider, and
 * records DELIVERED or FAILED — silence is left alone and asked again next
 * run.
 *
 * Only the last 48 hours are polled. Anything older with no delivery report
 * is never going to get one, and polling it forever just spends API quota.
 * Schedule alongside the reminder cron; every few minutes is fine.
 */
export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const recipients = await db.communicationRecipient.findMany({
    where: {
      channel: "SMS",
      status: "SENT",
      providerMessageId: { not: null },
      sentAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    orderBy: { sentAt: "asc" },
    take: 200,
    select: { id: true, providerMessageId: true },
  });

  let delivered = 0;
  let failed = 0;

  // Sequential on purpose: aggregators rate-limit status endpoints harder
  // than send endpoints, and this runs on a schedule with nobody waiting.
  for (const recipient of recipients) {
    const outcome = await fetchSmsDeliveryStatus(recipient.providerMessageId!);

    if (outcome.status === "DELIVERED") {
      await db.communicationRecipient.update({
        where: { id: recipient.id },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
      delivered += 1;
    } else if (outcome.status === "FAILED") {
      await db.communicationRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          error: outcome.detail ?? "Provider reported delivery failure",
        },
      });
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: recipients.length,
    delivered,
    failed,
    pending: recipients.length - delivered - failed,
  });
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
