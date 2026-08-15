"use server";

import { revalidatePath } from "next/cache";
import type { PaymentChannel } from "@prisma/client";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateTermInvoices, recordPayment } from "@/lib/finance";
import { notifyUsers } from "@/lib/messaging";
import { formatMoney, toMinor } from "@/lib/money";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

// -----------------------------------------------------------------------------
// Record a payment at the front desk
// -----------------------------------------------------------------------------

export type RecordPaymentState = {
  ok?: boolean;
  error?: string;
  receiptNo?: string;
};

export async function recordPaymentAction(
  _previous: RecordPaymentState,
  formData: FormData,
): Promise<RecordPaymentState> {
  let user;
  try {
    user = await authorize("finance.payment.record");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = String(formData.get("studentId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const channel = String(formData.get("channel") ?? "CASH") as PaymentChannel;
  const invoiceId = String(formData.get("invoiceId") ?? "");

  if (!studentId) return { error: "Select a student." };

  const amountMinor = toMinor(amountRaw);
  if (amountMinor <= 0) return { error: "Enter an amount greater than zero." };

  // Guard against a slipped decimal point — a GH₵50,000 "payment" on a
  // GH₵1,500 bill is almost always a typo.
  const outstanding = await db.invoice.aggregate({
    where: { studentId, balanceMinor: { gt: 0 } },
    _sum: { balanceMinor: true },
  });
  const owed = outstanding._sum.balanceMinor ?? 0;
  if (owed > 0 && amountMinor > owed * 3) {
    return {
      error: `That is more than three times the outstanding balance of ${formatMoney(owed)}. Check the amount.`,
    };
  }

  try {
    const payment = await recordPayment({
      studentId,
      amountMinor,
      channel,
      provider: ["CASH", "CHEQUE"].includes(channel) ? "MANUAL" : "PAYSTACK",
      status: "SUCCESS",
      momoNetwork: (formData.get("momoNetwork") as string) || null,
      momoNumber: (formData.get("momoNumber") as string) || null,
      bankName: (formData.get("bankName") as string) || null,
      bankReference: (formData.get("bankReference") as string) || null,
      chequeNumber: (formData.get("chequeNumber") as string) || null,
      payerName: (formData.get("payerName") as string) || null,
      payerPhone: (formData.get("payerPhone") as string) || null,
      narration: (formData.get("narration") as string) || null,
      receivedById: user.staffId,
      // An explicit invoice overrides oldest-first allocation.
      allocations: invoiceId ? [{ invoiceId, amountMinor }] : undefined,
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: "finance.payment.record",
        entity: "Payment",
        entityId: payment.id,
        summary: `Recorded ${formatMoney(amountMinor)} (${channel})`,
      },
    });

    // Let the guardians know a payment landed on their account.
    const guardians = await db.studentGuardian.findMany({
      where: { studentId, isBillPayer: true },
      select: { guardian: { select: { user: { select: { id: true } } } } },
    });
    const userIds = guardians
      .map((link) => link.guardian.user?.id)
      .filter((id): id is string => Boolean(id));

    if (userIds.length) {
      await notifyUsers(userIds, {
        title: "Payment received",
        body: `${formatMoney(amountMinor)} has been received. Receipt ${payment.receiptNo}.`,
        category: "FEE",
        url: "/portal/guardian/payments",
      }).catch(() => undefined);
    }

    revalidatePath("/finance");
    revalidatePath(`/students/${studentId}`);

    return { ok: true, receiptNo: payment.receiptNo };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

// -----------------------------------------------------------------------------
// Bulk billing
// -----------------------------------------------------------------------------

export async function generateInvoicesAction(formData: FormData) {
  const user = await authorize("finance.invoice.create");

  const academicYearId = String(formData.get("academicYearId") ?? "");
  const termId = String(formData.get("termId") ?? "");
  const dryRun = formData.get("dryRun") === "on";

  if (!academicYearId || !termId) {
    return { ok: false as const, error: "Choose an academic year and term." };
  }

  const result = await generateTermInvoices({
    academicYearId,
    termId,
    dryRun,
    createdById: user.id,
  });

  if (!dryRun) {
    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: "finance.invoice.bulk",
        summary: `Generated ${result.created} invoices totalling ${formatMoney(result.totalBilledMinor)}`,
      },
    });
    revalidatePath("/finance");
  }

  return { ok: true as const, ...result };
}

// -----------------------------------------------------------------------------
// Reminders
// -----------------------------------------------------------------------------

/** Sends a one-off reminder for a single invoice, outside the rule schedule. */
export async function sendInvoiceReminderAction(invoiceId: string) {
  const user = await authorize("finance.reminder.manage");

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      balanceMinor: true,
      dueDate: true,
      student: {
        select: {
          id: true,
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

  if (!invoice) return { ok: false as const, error: "Invoice not found." };

  const userIds = invoice.student.guardians
    .map((link) => link.guardian.user?.id)
    .filter((id): id is string => Boolean(id));

  if (!userIds.length) {
    return {
      ok: false as const,
      error: "No guardian on this account has a portal login to notify.",
    };
  }

  await notifyUsers(userIds, {
    title: "Outstanding school fees",
    body: `The balance for ${invoice.student.firstName} ${invoice.student.lastName} is ${formatMoney(invoice.balanceMinor)}. Kindly settle at your earliest convenience.`,
    category: "FEE",
    priority: "HIGH",
    url: "/portal/guardian/fees",
  });

  await db.$transaction([
    db.feeReminder.create({
      data: {
        invoiceId: invoice.id,
        kind: "MANUAL",
        channels: ["IN_APP", "PUSH"],
        balanceAtSendMinor: invoice.balanceMinor,
      },
    }),
    db.invoice.update({
      where: { id: invoice.id },
      data: { remindersSent: { increment: 1 }, lastReminderAt: new Date() },
    }),
  ]);

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "finance.reminder.send",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Manual fee reminder sent to ${userIds.length} guardian(s)`,
    },
  });

  revalidatePath("/finance/invoices");
  return { ok: true as const, notified: userIds.length };
}
