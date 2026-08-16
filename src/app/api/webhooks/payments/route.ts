import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { allocatePaymentToOldestInvoices, recalculateInvoice } from "@/lib/finance";
import { getGateway } from "@/lib/payments";
import { notifyUsers } from "@/lib/messaging";
import { formatMoney } from "@/lib/money";

/**
 * Payment provider callback.
 *
 * The provider is the source of truth for whether money moved, so this route
 * only ever *confirms* a payment we already created when checkout started.
 * It never creates a payment from webhook data alone.
 */
export async function POST(request: Request) {
  const gateway = getGateway();

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

  const payment = await db.payment.findUnique({
    where: { reference: event.reference },
    include: {
      allocations: { select: { invoiceId: true } },
      student: {
        select: {
          firstName: true,
          lastName: true,
          guardians: {
            where: { isBillPayer: true },
            select: { guardian: { select: { user: { select: { id: true } } } } },
          },
        },
      },
    },
  });

  if (!payment) {
    // Nothing to reconcile against — acknowledge so the provider stops
    // retrying, but record it for the bursar to investigate.
    console.warn("[webhook] no payment for reference", event.reference);
    return NextResponse.json({ ok: true, unmatched: true });
  }

  // Already settled: webhooks are delivered more than once by design.
  if (payment.status === "SUCCESS") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const result = event.result;

  if (result.status !== "SUCCESS") {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: result.status,
        failedAt: result.status === "FAILED" ? new Date() : null,
        failureReason: result.error ?? null,
        providerPayload: (result.raw ?? undefined) as never,
      },
    });
    return NextResponse.json({ ok: true, status: result.status });
  }

  // Guard against a tampered or mismatched amount before crediting anything.
  if (result.amountMinor !== undefined && result.amountMinor !== payment.amountMinor) {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: `Amount mismatch: expected ${payment.amountMinor}, provider reported ${result.amountMinor}`,
        providerPayload: (result.raw ?? undefined) as never,
      },
    });
    return NextResponse.json({ error: "Amount mismatch" }, { status: 409 });
  }

  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: "SUCCESS",
      confirmedAt: new Date(),
      paidAt: result.paidAt ?? new Date(),
      feeMinor: result.feeMinor ?? 0,
      providerReference: result.providerReference ?? payment.providerReference,
      providerPayload: (result.raw ?? undefined) as never,
      channel: result.channel ?? payment.channel,
      momoNetwork: result.momoNetwork ?? payment.momoNetwork,
      momoNumber: result.momoNumber ?? payment.momoNumber,
      cardLast4: result.cardLast4 ?? payment.cardLast4,
      cardBrand: result.cardBrand ?? payment.cardBrand,
      bankName: result.bankName ?? payment.bankName,
    },
  });

  if (payment.allocations.length) {
    // Somebody chose the invoices — a bursar recording a payment against
    // specific bills. Honour that.
    for (const allocation of payment.allocations) {
      await recalculateInvoice(allocation.invoiceId);
    }
  } else {
    // Nobody did: this money arrived from a checkout. Without this the payment
    // reached SUCCESS, a receipt was issued, and every invoice stayed exactly
    // as outstanding as before.
    await allocatePaymentToOldestInvoices(payment.id);
  }

  const guardianUserIds = payment.student.guardians
    .map((link) => link.guardian.user?.id)
    .filter((id): id is string => Boolean(id));

  if (guardianUserIds.length) {
    await notifyUsers(guardianUserIds, {
      title: "Payment received",
      body: `We have received ${formatMoney(payment.amountMinor)} for ${payment.student.firstName} ${payment.student.lastName}. Receipt ${payment.receiptNo}.`,
      category: "FEE",
      url: `/portal/guardian/payments`,
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
