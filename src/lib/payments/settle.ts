import "server-only";

import { db } from "@/lib/db";
import { allocatePaymentToOldestInvoices, recalculateInvoice } from "@/lib/finance";
import { notifyUsers } from "@/lib/messaging";
import { formatMoney } from "@/lib/money";

import type { VerificationResult } from "./index";

/**
 * Turning a provider's answer into money on a student's account.
 *
 * This used to live inside the webhook route, which made the webhook the only
 * thing in the system that could settle a payment. That is a single point of
 * failure sitting on top of somebody else's network: a webhook lost while the
 * app was redeploying, or sent to a URL nobody configured in the Paystack
 * dashboard, left a parent charged and their invoice as outstanding as before —
 * and then the reminder rules chased them for money they had already paid.
 *
 * Three callers now: the webhook, the page the payer lands on when they come
 * back, and a scheduled sweep. They must agree exactly on what settlement
 * means, so it is written once.
 *
 * Everything here is safe to run twice, because all three regularly will.
 */

export type Settlement =
  | { outcome: "settled"; receiptNo: string; amountMinor: number }
  | { outcome: "already-settled"; receiptNo: string; amountMinor: number }
  | { outcome: "unmatched" }
  | { outcome: "rejected"; reason: string }
  | { outcome: "not-successful"; status: string; reason?: string }
  | { outcome: "still-pending" };

/**
 * Puts the money against the bills, whoever gets here and however often.
 *
 * Both underlying operations are idempotent — `allocatePaymentToOldestInvoices`
 * does nothing when allocations already exist, and recalculating an invoice
 * derives its totals from the allocation rows — so this is safe to call on
 * every settlement path, including the ones that discover the work was already
 * done. That is the point: it is the repair as well as the first attempt.
 */
async function ensureAllocated(
  paymentId: string,
  existing: Array<{ invoiceId: string }>,
): Promise<void> {
  if (existing.length) {
    // Somebody chose the invoices — a bursar recording a payment against
    // specific bills. Honour that, and bring those invoices into line.
    for (const allocation of existing) {
      await recalculateInvoice(allocation.invoiceId);
    }
    return;
  }

  // Nobody did: this money arrived from a checkout. Without this the payment
  // reached SUCCESS, a receipt was issued, and every invoice stayed exactly
  // as outstanding as before.
  await allocatePaymentToOldestInvoices(paymentId);
}

export async function settlePayment(
  reference: string,
  result: VerificationResult,
): Promise<Settlement> {
  const payment = await db.payment.findUnique({
    where: { reference },
    select: {
      id: true,
      status: true,
      amountMinor: true,
      currency: true,
      receiptNo: true,
      providerReference: true,
      channel: true,
      momoNetwork: true,
      momoNumber: true,
      cardLast4: true,
      cardBrand: true,
      bankName: true,
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

  // Nothing to reconcile against. Never create a payment from provider data
  // alone — a payment exists because this system started a checkout.
  if (!payment) return { outcome: "unmatched" };

  if (payment.status === "SUCCESS") {
    // Not a plain early return: finish the job first.
    //
    // Marking the payment SUCCESS and applying it to the invoices are two
    // separate commits, so a crash or a connection timeout between them leaves
    // a payment that is settled and applied to nothing. Returning here on the
    // status alone is what made that permanent — the provider's retry, the
    // payer's return and the sweep all looked at the same status and all
    // agreed there was nothing to do, while the family was chased for money
    // they had paid.
    await ensureAllocated(payment.id, payment.allocations);
    return {
      outcome: "already-settled",
      receiptNo: payment.receiptNo,
      amountMinor: payment.amountMinor,
    };
  }

  if (result.status === "PENDING") {
    return { outcome: "still-pending" };
  }

  if (result.status !== "SUCCESS") {
    await db.payment.updateMany({
      where: { id: payment.id, status: { not: "SUCCESS" } },
      data: {
        status: result.status,
        failedAt: result.status === "FAILED" ? new Date() : null,
        failureReason: result.error ?? null,
        providerPayload: (result.raw ?? undefined) as never,
      },
    });
    return { outcome: "not-successful", status: result.status, reason: result.error };
  }

  // Nothing is credited on an amount or a currency we did not ask for. The
  // currency check matters as much as the amount: 25000 minor units of one
  // currency is not 25000 of another, and comparing only the number would let
  // a misconfigured account settle a GHS invoice with a different currency's
  // money.
  if (result.amountMinor !== undefined && result.amountMinor !== payment.amountMinor) {
    const reason = `Amount mismatch: expected ${payment.amountMinor}, provider reported ${result.amountMinor}`;
    await db.payment.updateMany({
      where: { id: payment.id, status: { not: "SUCCESS" } },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: reason,
        providerPayload: (result.raw ?? undefined) as never,
      },
    });
    return { outcome: "rejected", reason };
  }

  if (result.currency && result.currency.toUpperCase() !== payment.currency.toUpperCase()) {
    const reason = `Currency mismatch: charged in ${payment.currency}, provider reported ${result.currency}`;
    await db.payment.updateMany({
      where: { id: payment.id, status: { not: "SUCCESS" } },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: reason,
        providerPayload: (result.raw ?? undefined) as never,
      },
    });
    return { outcome: "rejected", reason };
  }

  /**
   * One conditional UPDATE decides who settles this payment.
   *
   * Read-then-write was a real race, not a theoretical one: Paystack delivers
   * the same webhook more than once by design, and now a cron sweep and the
   * payer's own return can arrive at the same moment. Two callers could both
   * read PENDING, both proceed, and both notify — so a parent got two "payment
   * received" messages for one payment, and the bursar saw the confirmation
   * twice. `updateMany` with the status in the WHERE clause is a single
   * statement: exactly one caller changes a row, and the losers are told they
   * lost.
   */
  const claimed = await db.payment.updateMany({
    where: { id: payment.id, status: { not: "SUCCESS" } },
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

  if (claimed.count === 0) {
    // Another caller won the race. It may not have finished, so make sure the
    // allocation exists before agreeing there is nothing to do.
    await ensureAllocated(payment.id, payment.allocations);
    return {
      outcome: "already-settled",
      receiptNo: payment.receiptNo,
      amountMinor: payment.amountMinor,
    };
  }

  await ensureAllocated(payment.id, payment.allocations);

  const guardianUserIds = payment.student.guardians
    .map((link) => link.guardian.user?.id)
    .filter((id): id is string => Boolean(id));

  if (guardianUserIds.length) {
    // Never let a notification failure undo a settled payment.
    await notifyUsers(guardianUserIds, {
      title: "Payment received",
      body: `We have received ${formatMoney(payment.amountMinor)} for ${payment.student.firstName} ${payment.student.lastName}. Receipt ${payment.receiptNo}.`,
      category: "FEE",
      url: `/portal/guardian/payments`,
    }).catch(() => undefined);
  }

  return {
    outcome: "settled",
    receiptNo: payment.receiptNo,
    amountMinor: payment.amountMinor,
  };
}

/**
 * Asks the provider what became of every payment left in the air.
 *
 * A checkout that was started and never confirmed is the normal state of
 * affairs for a few minutes — the parent is still on the provider's page. After
 * that it means the webhook did not arrive, and the only way to find out is to
 * ask. Run from cron.
 *
 * `olderThanMinutes` keeps the sweep off payments still legitimately in
 * progress; `maxAge` stops it asking about a checkout somebody abandoned last
 * term, which the provider will answer for indefinitely and which will never
 * become anything.
 */
export async function reconcilePendingPayments(options?: {
  olderThanMinutes?: number;
  maxAgeDays?: number;
  limit?: number;
}): Promise<{
  examined: number;
  settled: number;
  failed: number;
  stillPending: number;
  abandoned: number;
  repaired: number;
}> {
  const { getGateway } = await import("./index");

  const olderThan = options?.olderThanMinutes ?? 10;
  const maxAgeDays = options?.maxAgeDays ?? 3;
  const limit = options?.limit ?? 200;

  const now = Date.now();
  const before = new Date(now - olderThan * 60_000);
  const after = new Date(now - maxAgeDays * 86_400_000);

  const stale = await db.payment.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      createdAt: { lt: before, gt: after },
      // A payment recorded at the front desk has no provider to ask.
      provider: { in: ["PAYSTACK", "HUBTEL"] },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { reference: true, provider: true },
  });

  const counts = { examined: 0, settled: 0, failed: 0, stillPending: 0, abandoned: 0, repaired: 0 };

  for (const payment of stale) {
    counts.examined += 1;

    // Ask the gateway the payment was actually created with, not whichever one
    // is configured now. A school that switched from Hubtel to Paystack on
    // Monday still has Friday's Hubtel payments to reconcile, and asking
    // Paystack about a Hubtel reference gets a confident "no such transaction".
    const gateway = await getGateway(payment.provider.toLowerCase());

    try {
      const result = await gateway.verify(payment.reference);
      if (!result.ok) {
        counts.stillPending += 1;
        continue;
      }

      const settlement = await settlePayment(payment.reference, result);
      if (settlement.outcome === "settled") counts.settled += 1;
      else if (settlement.outcome === "not-successful" || settlement.outcome === "rejected") {
        counts.failed += 1;
      } else if (settlement.outcome === "still-pending") counts.stillPending += 1;
    } catch (error) {
      // One unreachable provider must not stop the sweep — the next payment
      // may be with a different one, and the run has to be safe to repeat.
      console.warn(`[reconcile] ${payment.reference}: ${(error as Error).message}`);
      counts.stillPending += 1;
    }
  }

  /**
   * Payments that are settled and applied to nothing.
   *
   * Marking a payment SUCCESS and allocating it are separate commits, so a
   * crash between them leaves money recorded as received and every invoice
   * still outstanding. `settlePayment` now repairs that whenever it is asked
   * about such a payment, but nothing asks: the provider stops retrying once
   * it gets a 200, and this sweep only looks at PENDING and PROCESSING. So it
   * looks for them directly.
   *
   * No provider is contacted — the money is already confirmed. This only
   * finishes writing it down.
   */
  const unapplied = await db.payment.findMany({
    where: {
      status: "SUCCESS",
      allocations: { none: {} },
      createdAt: { gt: after },
    },
    take: limit,
    select: { id: true },
  });

  for (const payment of unapplied) {
    try {
      // An overpayment legitimately allocates to nothing and will be picked up
      // here on every run; that costs one query and is harmless.
      await allocatePaymentToOldestInvoices(payment.id);
      counts.repaired += 1;
    } catch (error) {
      console.warn(`[reconcile] could not allocate ${payment.id}: ${(error as Error).message}`);
    }
  }

  /**
   * Old, still unconfirmed, and asked about.
   *
   * This used to cancel every stale row outright, without contacting anyone —
   * which meant a payment that really had been made, and whose webhook was
   * simply lost, was written off permanently the moment it was three days old.
   * A school that switched the sweep on late would have destroyed exactly the
   * records it was installed to recover.
   *
   * Now the provider is asked first, and only a transaction the provider says
   * is not successful is closed. Anything the provider still calls pending is
   * left alone for a bursar to look at, because "we could not find out" is not
   * the same as "it did not happen".
   */
  const old = await db.payment.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      createdAt: { lt: after },
      provider: { in: ["PAYSTACK", "HUBTEL"] },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { reference: true, provider: true, id: true },
  });

  for (const payment of old) {
    try {
      const gateway = await getGateway(payment.provider.toLowerCase());
      const result = await gateway.verify(payment.reference);

      if (result.ok && result.status === "SUCCESS") {
        // Late, but real. Settle it rather than cancel it.
        const settlement = await settlePayment(payment.reference, result);
        if (settlement.outcome === "settled") counts.settled += 1;
        continue;
      }

      if (result.ok && result.status === "PENDING") {
        // The provider still has it open. Not ours to close.
        counts.stillPending += 1;
        continue;
      }

      await db.payment.updateMany({
        where: { id: payment.id, status: { in: ["PENDING", "PROCESSING"] } },
        data: {
          status: "CANCELLED",
          failureReason: `Closed after ${maxAgeDays} days: the provider reports no successful transaction for this reference.`,
        },
      });
      counts.abandoned += 1;
    } catch (error) {
      console.warn(`[reconcile] ${payment.reference}: ${(error as Error).message}`);
      counts.stillPending += 1;
    }
  }

  return counts;
}
