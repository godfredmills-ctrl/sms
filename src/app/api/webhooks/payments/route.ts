import { NextResponse } from "next/server";

import { getGateway } from "@/lib/payments";
import { settlePayment } from "@/lib/payments/settle";

/**
 * Payment provider callback.
 *
 * The provider is the source of truth for whether money moved, so this route
 * only ever *confirms* a payment we already created when checkout started.
 * It never creates a payment from webhook data alone.
 *
 * What settlement means lives in `settlePayment`, shared with the scheduled
 * sweep and with the page the payer returns to — because a webhook is somebody
 * else's network and cannot be the only thing that can credit an account.
 */
export async function POST(request: Request) {
  const gateway = await getGateway();

  // The raw body is needed byte-for-byte to verify the signature.
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-paystack-signature") ??
    request.headers.get("x-hubtel-signature");

  const event = await gateway.parseWebhook(rawBody, signature);

  if (!event.ok) {
    console.warn("[webhook] rejected", event.error);
    return NextResponse.json({ error: event.error }, { status: 400 });
  }

  // A verified event we do not care about (a transfer, a subscription).
  if (!event.reference || !event.result) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const settlement = await settlePayment(event.reference, event.result);

  switch (settlement.outcome) {
    case "unmatched":
      // Acknowledge so the provider stops retrying, but record it: a reference
      // this system never issued is worth a bursar's attention.
      console.warn("[webhook] no payment for reference", event.reference);
      return NextResponse.json({ ok: true, unmatched: true });

    case "rejected":
      return NextResponse.json({ error: settlement.reason }, { status: 409 });

    case "already-settled":
      // Webhooks are delivered more than once by design.
      return NextResponse.json({ ok: true, duplicate: true });

    case "not-successful":
      return NextResponse.json({ ok: true, status: settlement.status });

    case "still-pending":
      return NextResponse.json({ ok: true, pending: true });

    case "settled":
      return NextResponse.json({ ok: true, receipt: settlement.receiptNo });
  }
}
