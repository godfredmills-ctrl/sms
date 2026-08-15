"use server";

import { redirect } from "next/navigation";
import type { PaymentChannel } from "@prisma/client";

import { authorize } from "@/lib/auth";
import { generateToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { nextReceiptNumber } from "@/lib/finance";
import { formatMoney, toMinor } from "@/lib/money";
import { getGateway } from "@/lib/payments";

export type CheckoutState = { error?: string };

/**
 * Starts an online fee payment.
 *
 * A PENDING payment row is created *before* the payer leaves for the gateway,
 * so the webhook always has something to reconcile against and money can never
 * arrive for a transaction the school has no record of.
 */
export async function startCheckout(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const user = await authorize("portal.fees.pay");

  const studentId = String(formData.get("studentId") ?? "");
  const amountMinor = toMinor(String(formData.get("amount") ?? ""));
  const channel = (String(formData.get("channel") ?? "MOBILE_MONEY") ||
    "MOBILE_MONEY") as PaymentChannel;

  if (!studentId) return { error: "Choose which child you are paying for." };
  if (amountMinor <= 0) return { error: "Enter an amount greater than zero." };

  // Confirm this guardian is actually linked to the student.
  const link = await db.studentGuardian.findFirst({
    where: { studentId, guardian: { userId: user.id } },
    select: {
      guardianId: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  if (!link) {
    return { error: "You are not linked to this student." };
  }

  const reference = `PAY-${generateToken(12).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14)}`;
  const gateway = getGateway();

  const payment = await db.payment.create({
    data: {
      receiptNo: await nextReceiptNumber(),
      reference,
      studentId,
      guardianId: link.guardianId,
      amountMinor,
      currency: "GHS",
      channel,
      provider: gateway.id,
      // Nothing is credited until the provider confirms it.
      status: "PENDING",
      payerName: user.fullName,
      payerPhone: user.phone,
      narration: `Online fee payment for ${link.student.firstName} ${link.student.lastName}`,
    },
  });

  const checkout = await gateway.initiate({
    amountMinor,
    currency: "GHS",
    email: user.email ?? `${user.id}@guardian.local`,
    phone: user.phone,
    reference,
    callbackUrl: `${env.appUrl}/portal/guardian/fees?ref=${reference}`,
    channels: [channel],
    metadata: {
      studentId,
      guardianUserId: user.id,
      description: `School fees — ${formatMoney(amountMinor)}`,
    },
  });

  if (!checkout.ok || !checkout.authorizationUrl) {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: checkout.error ?? "Could not start checkout.",
      },
    });
    return {
      error:
        checkout.error ??
        "We could not start the payment. Please try again or pay at the school office.",
    };
  }

  await db.payment.update({
    where: { id: payment.id },
    data: {
      authorizationUrl: checkout.authorizationUrl,
      providerReference: checkout.providerReference ?? null,
      ussdCode: checkout.ussdCode ?? null,
      status: "PROCESSING",
    },
  });

  redirect(checkout.authorizationUrl);
}
