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
  paymentId?: string;
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

    return { ok: true, receiptNo: payment.receiptNo, paymentId: payment.id };
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

// -----------------------------------------------------------------------------
// Fee categories and structures
// -----------------------------------------------------------------------------

export type FinanceFormState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createFeeCategoryAction(
  _previous: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  try {
    await authorize("finance.fee.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const name = text(formData, "name");
  if (!name) return { error: "Name the fee category." };

  const code =
    text(formData, "code").toUpperCase() ||
    name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10);

  if (await db.feeCategory.findUnique({ where: { code } })) {
    return { error: `A category with code "${code}" already exists.` };
  }

  const last = await db.feeCategory.findFirst({
    orderBy: { sortKey: "desc" },
    select: { sortKey: true },
  });

  await db.feeCategory.create({
    data: {
      name,
      code,
      description: text(formData, "description") || null,
      isRecurring: formData.get("isRecurring") === "on",
      isMandatory: formData.get("isOptional") !== "on",
      isOptional: formData.get("isOptional") === "on",
      glCode: text(formData, "glCode") || null,
      sortKey: (last?.sortKey ?? 0) + 10,
    },
  });

  revalidatePath("/finance/structures");
  return { ok: true, message: `Added ${name}.` };
}

export async function createFeeStructureAction(
  _previous: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  try {
    await authorize("finance.fee.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const name = text(formData, "name");
  const academicYearId = text(formData, "academicYearId");
  if (!name || !academicYearId) {
    return { error: "Name the structure and choose an academic year." };
  }

  const dueDate = text(formData, "dueDate");
  const minimumFirst = text(formData, "minimumFirstPayment");

  await db.feeStructure.create({
    data: {
      name,
      academicYearId,
      termId: text(formData, "termId") || null,
      classLevelId: text(formData, "classLevelId") || null,
      boarderType: text(formData, "boarderType") || "ALL",
      studentType: text(formData, "studentType") || "ALL",
      dueDate: dueDate ? new Date(dueDate) : null,
      minimumFirstPaymentMinor: minimumFirst ? toMinor(minimumFirst) : null,
      notes: text(formData, "notes") || null,
    },
  });

  revalidatePath("/finance/structures");
  return { ok: true, message: `Created ${name}. Add its fee lines next.` };
}

export async function setStructureItemAction(formData: FormData) {
  await authorize("finance.fee.manage");

  const structureId = text(formData, "structureId");
  const categoryId = text(formData, "categoryId");
  const amount = text(formData, "amount");
  if (!structureId || !categoryId) return;

  const amountMinor = toMinor(amount);

  // Zero removes the line. Billing a category at GH₵0 and omitting it produce
  // the same invoice, and an empty row on the structure is just noise.
  if (amountMinor <= 0) {
    await db.feeStructureItem.deleteMany({ where: { structureId, categoryId } });
    revalidatePath("/finance/structures");
    return;
  }

  // Taken from the category, not from the form. The row on the structures page
  // is an amount box and a Save button — there is no optional checkbox on it —
  // so reading one meant every line saved as mandatory, including lines on
  // categories the school had explicitly marked Optional. Billing filters on
  // the line's flag, so school bus, lunch and club fees went onto every
  // student's invoice, and the page displayed an "Optional" badge beside each
  // of them from the category while the line underneath said otherwise.
  const category = await db.feeCategory.findUnique({
    where: { id: categoryId },
    select: { isOptional: true },
  });
  const isOptional = category?.isOptional ?? false;

  await db.feeStructureItem.upsert({
    where: { structureId_categoryId: { structureId, categoryId } },
    create: {
      structureId,
      categoryId,
      amountMinor,
      description: text(formData, "description") || null,
      isOptional,
    },
    update: {
      amountMinor,
      description: text(formData, "description") || null,
      isOptional,
    },
  });

  revalidatePath("/finance/structures");
}

/**
 * Publishing is what makes a structure billable. Until then it can be edited
 * freely; afterwards a change silently alters what every future invoice
 * charges, so the transition is explicit and audited.
 */
export async function toggleStructurePublishedAction(formData: FormData) {
  const user = await authorize("finance.fee.manage");

  const id = text(formData, "id");
  if (!id) return;

  const structure = await db.feeStructure.findUnique({
    where: { id },
    select: { isPublished: true, name: true, items: { select: { id: true } } },
  });
  if (!structure) return;

  // A structure with no lines would bill everyone GH₵0.
  if (!structure.isPublished && structure.items.length === 0) return;

  await db.feeStructure.update({
    where: { id },
    data: { isPublished: !structure.isPublished },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: structure.isPublished
        ? "finance.structure.unpublish"
        : "finance.structure.publish",
      entity: "FeeStructure",
      entityId: id,
      summary: `${structure.isPublished ? "Withdrew" : "Published"} ${structure.name}`,
    },
  });

  revalidatePath("/finance/structures");
}

// -----------------------------------------------------------------------------
// Discounts and scholarships
// -----------------------------------------------------------------------------

export async function createDiscountAction(
  _previous: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  let user;
  try {
    user = await authorize("finance.discount.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = text(formData, "studentId");
  const name = text(formData, "name");
  const type = text(formData, "type") || "PERCENTAGE";
  const rawValue = text(formData, "value");
  if (!studentId || !name || !rawValue) {
    return { error: "Choose a student, name the award and set its value." };
  }

  const value = type === "PERCENTAGE" ? Number(rawValue) : toMinor(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    return { error: "The value must be greater than zero." };
  }
  if (type === "PERCENTAGE" && value > 100) {
    return { error: "A percentage discount cannot exceed 100%." };
  }

  const startsOn = text(formData, "startsOn");
  const endsOn = text(formData, "endsOn");

  await db.studentDiscount.create({
    data: {
      studentId,
      name,
      type: type as never,
      value,
      categoryId: text(formData, "categoryId") || null,
      academicYearId: text(formData, "academicYearId") || null,
      reason: text(formData, "reason") || null,
      sponsorName: text(formData, "sponsorName") || null,
      startsOn: startsOn ? new Date(startsOn) : null,
      endsOn: endsOn ? new Date(endsOn) : null,
      approvedBy: user.fullName,
      approvedAt: new Date(),
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "finance.discount.create",
      entity: "Student",
      entityId: studentId,
      summary: `Awarded "${name}"`,
    },
  });

  revalidatePath("/finance/discounts");
  return { ok: true, message: `Awarded "${name}".` };
}

export async function toggleDiscountAction(formData: FormData) {
  const user = await authorize("finance.discount.manage");

  const id = text(formData, "id");
  if (!id) return;

  const discount = await db.studentDiscount.findUnique({
    where: { id },
    select: { isActive: true, name: true, studentId: true },
  });
  if (!discount) return;

  await db.studentDiscount.update({
    where: { id },
    data: { isActive: !discount.isActive },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: discount.isActive
        ? "finance.discount.withdraw"
        : "finance.discount.restore",
      entity: "Student",
      entityId: discount.studentId,
      summary: `${discount.isActive ? "Withdrew" : "Restored"} "${discount.name}"`,
    },
  });

  revalidatePath("/finance/discounts");
}

// -----------------------------------------------------------------------------
// Reminder rules
// -----------------------------------------------------------------------------

export async function saveReminderRuleAction(
  _previous: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  try {
    await authorize("finance.reminder.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const name = text(formData, "name");
  const trigger = text(formData, "trigger");
  if (!name || !trigger) return { error: "Name the rule and choose a trigger." };

  const channels = formData.getAll("channels").map(String).filter(Boolean);
  if (!channels.length) return { error: "Choose at least one channel." };

  const sendAfterHour = Number(text(formData, "sendAfterHour"));
  const sendBeforeHour = Number(text(formData, "sendBeforeHour"));
  if (sendAfterHour >= sendBeforeHour) {
    return { error: "The quiet-hours window must start before it ends." };
  }

  const id = text(formData, "id");
  const data = {
    name,
    trigger,
    offsetDays: Number(text(formData, "offsetDays")) || 0,
    repeatEveryDays: Number(text(formData, "repeatEveryDays")) || 0,
    maxReminders: Number(text(formData, "maxReminders")) || 3,
    minBalanceMinor: toMinor(text(formData, "minBalance") || "0"),
    channels: channels as never,
    audience: text(formData, "audience") || "BILL_PAYERS",
    sendAfterHour,
    sendBeforeHour,
  };

  if (id) {
    await db.reminderRule.update({ where: { id }, data });
  } else {
    await db.reminderRule.create({ data });
  }

  revalidatePath("/finance/reminders");
  return { ok: true, message: id ? "Rule updated." : `Created "${name}".` };
}

export async function toggleReminderRuleAction(formData: FormData) {
  await authorize("finance.reminder.manage");

  const id = text(formData, "id");
  if (!id) return;

  const rule = await db.reminderRule.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!rule) return;

  await db.reminderRule.update({ where: { id }, data: { isActive: !rule.isActive } });
  revalidatePath("/finance/reminders");
}

// -----------------------------------------------------------------------------
// Invoice lifecycle
// -----------------------------------------------------------------------------

export async function issueInvoiceAction(formData: FormData) {
  const user = await authorize("finance.invoice.create");

  const id = text(formData, "id");
  if (!id) return;

  const invoice = await db.invoice.findUnique({
    where: { id },
    select: { status: true, totalMinor: true, invoiceNo: true },
  });
  if (!invoice || invoice.status !== "DRAFT") return;

  await db.invoice.update({
    where: { id },
    data: { status: "ISSUED", issueDate: new Date() },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "finance.invoice.issue",
      entity: "Invoice",
      entityId: id,
      summary: `Issued ${invoice.invoiceNo} for ${formatMoney(invoice.totalMinor)}`,
    },
  });

  revalidatePath("/finance/invoices");
}

/**
 * Cancels an invoice. Refused once money has been allocated to it: reversing a
 * receipted payment is a refund, which is a different, deliberate act.
 */
export async function cancelInvoiceAction(formData: FormData) {
  const user = await authorize("finance.invoice.update");

  const id = text(formData, "id");
  if (!id) return;

  const invoice = await db.invoice.findUnique({
    where: { id },
    select: { paidMinor: true, invoiceNo: true, status: true },
  });
  if (!invoice || invoice.status === "CANCELLED") return;
  if (invoice.paidMinor > 0) return;

  await db.invoice.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), balanceMinor: 0 },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "finance.invoice.cancel",
      entity: "Invoice",
      entityId: id,
      summary: `Cancelled ${invoice.invoiceNo}`,
    },
  });

  revalidatePath("/finance/invoices");
}
