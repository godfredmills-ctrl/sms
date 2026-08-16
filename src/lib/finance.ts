import { Prisma } from "@prisma/client";
import type {
  InvoiceStatus,
  PaymentChannel,
  PaymentProvider,
  PaymentStatus,
} from "@prisma/client";

import { db } from "./db";
import { generateCode } from "./crypto";
import { applyPercentage, splitEvenly, sumMinor } from "./money";

/**
 * Fee domain logic.
 *
 * Two rules drive everything here:
 *  1. Money is always integer minor units (pesewas).
 *  2. A payment is never tied to a single invoice. It is recorded once and
 *     then *allocated* across invoices, which is what makes part payments,
 *     over-payments and credit balances behave correctly.
 */

// -----------------------------------------------------------------------------
// Document numbering
// -----------------------------------------------------------------------------

/**
 * Sequential, human-readable document numbers. The unique constraint on the
 * column is the real guard — under concurrency we retry, and fall back to a
 * random suffix rather than block the bursar mid-transaction.
 */
async function nextDocumentNumber(
  prefix: string,
  countExisting: () => Promise<number>,
  attempt = 0,
): Promise<string> {
  const year = new Date().getFullYear();
  if (attempt >= 3) return `${prefix}-${year}-${generateCode(6)}`;
  const count = await countExisting();
  return `${prefix}-${year}-${String(count + 1 + attempt).padStart(5, "0")}`;
}

export function nextInvoiceNumber(attempt = 0) {
  return nextDocumentNumber("INV", () => db.invoice.count(), attempt);
}

export function nextReceiptNumber(attempt = 0) {
  return nextDocumentNumber("RCT", () => db.payment.count(), attempt);
}

// -----------------------------------------------------------------------------
// Discounts
// -----------------------------------------------------------------------------

type DiscountLike = {
  type: "PERCENTAGE" | "FIXED";
  value: number;
  categoryId: string | null;
};

/**
 * Applies a student's active discounts to a set of billable lines.
 * Category-scoped discounts only touch their own line; unscoped discounts
 * apply to the whole bill.
 */
export function computeDiscounts(
  lines: Array<{ categoryId: string | null; amountMinor: number }>,
  discounts: DiscountLike[],
): { perLine: number[]; total: number } {
  const perLine = lines.map(() => 0);

  for (const discount of discounts) {
    const targets = discount.categoryId
      ? lines
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => line.categoryId === discount.categoryId)
      : lines.map((line, index) => ({ line, index }));

    if (!targets.length) continue;

    if (discount.type === "PERCENTAGE") {
      for (const { line, index } of targets) {
        perLine[index] += applyPercentage(line.amountMinor, discount.value);
      }
    } else {
      // Spread a fixed discount proportionally so no single line goes negative.
      const subtotal = sumMinor(targets.map(({ line }) => line.amountMinor));
      if (subtotal <= 0) continue;
      const capped = Math.min(discount.value, subtotal);
      let remaining = capped;

      targets.forEach(({ line, index }, position) => {
        const share =
          position === targets.length - 1
            ? remaining
            : Math.floor((capped * line.amountMinor) / subtotal);
        perLine[index] += share;
        remaining -= share;
      });
    }
  }

  // Never discount a line below zero.
  lines.forEach((line, index) => {
    perLine[index] = Math.min(perLine[index], line.amountMinor);
  });

  return { perLine, total: sumMinor(perLine) };
}

// -----------------------------------------------------------------------------
// Invoice creation
// -----------------------------------------------------------------------------

export type BillingResult = {
  created: number;
  skipped: number;
  totalBilledMinor: number;
  errors: Array<{ studentId: string; message: string }>;
};

/**
 * Generates term invoices for every enrolled student in scope, using the fee
 * structure that matches each student's class level, boarding status and
 * local/international band.
 */
export async function generateTermInvoices(options: {
  academicYearId: string;
  termId: string;
  classLevelIds?: string[];
  studentIds?: string[];
  dueDate?: Date | null;
  createdById?: string | null;
  /** Validate and report without writing anything. */
  dryRun?: boolean;
}): Promise<BillingResult> {
  const result: BillingResult = {
    created: 0,
    skipped: 0,
    totalBilledMinor: 0,
    errors: [],
  };

  // The date a discount is judged against. One value for the whole run, so a
  // batch that starts before midnight and finishes after it bills every student
  // on the same terms.
  const billedOn = new Date();

  const structures = await db.feeStructure.findMany({
    where: {
      academicYearId: options.academicYearId,
      OR: [{ termId: options.termId }, { termId: null }],
      isPublished: true,
    },
    include: { items: { include: { category: true } } },
  });

  if (!structures.length) {
    result.errors.push({
      studentId: "-",
      message: "No published fee structure matches this year and term.",
    });
    return result;
  }

  const students = await db.student.findMany({
    where: {
      status: "ENROLLED",
      ...(options.studentIds?.length ? { id: { in: options.studentIds } } : {}),
      enrollments: {
        some: {
          academicYearId: options.academicYearId,
          status: "ACTIVE",
          ...(options.classLevelIds?.length
            ? { classSection: { classLevelId: { in: options.classLevelIds } } }
            : {}),
        },
      },
    },
    select: {
      id: true,
      nationality: true,
      isBoarder: true,
      enrollments: {
        where: { academicYearId: options.academicYearId },
        select: { classSection: { select: { classLevelId: true } } },
        take: 1,
      },
      discounts: {
        where: {
          isActive: true,
          // The award's own dates were captured on the form, shown on the
          // discounts screen, and never consulted when billing. A one-year
          // scholarship, a bursary for a term of hardship, a sibling discount
          // that ends when the older child leaves — all of them kept coming
          // off every future invoice until somebody noticed and withdrew them
          // by hand. Undercharging is the quiet direction to be wrong in: a
          // family does not query a bill that is too small.
          AND: [
            { OR: [{ startsOn: null }, { startsOn: { lte: billedOn } }] },
            { OR: [{ endsOn: null }, { endsOn: { gte: billedOn } }] },
          ],
          OR: [
            { academicYearId: options.academicYearId },
            { academicYearId: null },
          ],
        },
        select: { type: true, value: true, categoryId: true },
      },
      invoices: {
        where: { termId: options.termId },
        select: { id: true },
      },
    },
  });

  for (const student of students) {
    // One invoice per student per term — re-running billing must be safe.
    if (student.invoices.length) {
      result.skipped += 1;
      continue;
    }

    const classLevelId = student.enrollments[0]?.classSection.classLevelId;
    const studentType =
      student.nationality?.toLowerCase() === "ghanaian" ? "LOCAL" : "INTERNATIONAL";
    const boarderType = student.isBoarder ? "BOARDER" : "DAY";

    const structure = structures.find(
      (candidate) =>
        (!candidate.classLevelId || candidate.classLevelId === classLevelId) &&
        (!candidate.boarderType ||
          candidate.boarderType === "ALL" ||
          candidate.boarderType === boarderType) &&
        (!candidate.studentType ||
          candidate.studentType === "ALL" ||
          candidate.studentType === studentType),
    );

    if (!structure) {
      result.errors.push({
        studentId: student.id,
        message: "No fee structure matches this student's level and status.",
      });
      continue;
    }

    const billable = structure.items.filter((item) => !item.isOptional);
    const lines = billable.map((item) => ({
      categoryId: item.categoryId,
      description: item.description ?? item.category.name,
      amountMinor: item.amountMinor,
      sortKey: item.sortKey,
    }));

    const { perLine, total: discountMinor } = computeDiscounts(
      lines,
      student.discounts.map((discount) => ({
        type: discount.type,
        value: discount.value,
        categoryId: discount.categoryId,
      })),
    );

    const subtotalMinor = sumMinor(lines.map((line) => line.amountMinor));
    const totalMinor = subtotalMinor - discountMinor;

    result.totalBilledMinor += totalMinor;
    result.created += 1;

    if (options.dryRun) continue;

    try {
      await createInvoice({
        studentId: student.id,
        academicYearId: options.academicYearId,
        termId: options.termId,
        title: structure.name,
        currency: structure.currency,
        dueDate: options.dueDate ?? structure.dueDate,
        createdById: options.createdById,
        lines: lines.map((line, index) => ({
          categoryId: line.categoryId,
          description: line.description,
          quantity: 1,
          unitPriceMinor: line.amountMinor,
          discountMinor: perLine[index],
          sortKey: line.sortKey,
        })),
      });
    } catch (error) {
      result.created -= 1;
      result.totalBilledMinor -= totalMinor;
      result.errors.push({ studentId: student.id, message: (error as Error).message });
    }
  }

  return result;
}

export async function createInvoice(input: {
  studentId: string;
  academicYearId: string;
  termId?: string | null;
  title?: string | null;
  currency?: string;
  dueDate?: Date | null;
  notes?: string | null;
  createdById?: string | null;
  status?: InvoiceStatus;
  lines: Array<{
    categoryId?: string | null;
    description: string;
    quantity?: number;
    unitPriceMinor: number;
    discountMinor?: number;
    sortKey?: number;
  }>;
}) {
  const lines = input.lines.map((line, index) => {
    const quantity = line.quantity ?? 1;
    const gross = Math.round(line.unitPriceMinor * quantity);
    const discount = Math.min(line.discountMinor ?? 0, gross);
    return {
      categoryId: line.categoryId ?? null,
      description: line.description,
      quantity: new Prisma.Decimal(quantity),
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: discount,
      amountMinor: gross - discount,
      sortKey: line.sortKey ?? index,
    };
  });

  const subtotalMinor = sumMinor(
    lines.map((line) => line.amountMinor + line.discountMinor),
  );
  const discountMinor = sumMinor(lines.map((line) => line.discountMinor));
  const totalMinor = subtotalMinor - discountMinor;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await db.invoice.create({
        data: {
          invoiceNo: await nextInvoiceNumber(attempt),
          studentId: input.studentId,
          academicYearId: input.academicYearId,
          termId: input.termId ?? null,
          title: input.title ?? null,
          currency: input.currency ?? "GHS",
          status: input.status ?? "ISSUED",
          subtotalMinor,
          discountMinor,
          totalMinor,
          paidMinor: 0,
          balanceMinor: totalMinor,
          dueDate: input.dueDate ?? null,
          notes: input.notes ?? null,
          createdById: input.createdById ?? null,
          lines: { create: lines },
        },
        include: { lines: true },
      });
    } catch (error) {
      // Retry only on a duplicate invoice number.
      if (!isUniqueViolation(error, "invoiceNo") || attempt === 3) throw error;
    }
  }

  throw new Error("Could not allocate an invoice number.");
}

// -----------------------------------------------------------------------------
// Payments and allocation
// -----------------------------------------------------------------------------

export type RecordPaymentInput = {
  studentId: string;
  guardianId?: string | null;
  amountMinor: number;
  currency?: string;
  channel: PaymentChannel;
  provider?: PaymentProvider;
  status?: PaymentStatus;
  reference?: string;
  providerReference?: string | null;
  providerPayload?: unknown;
  feeMinor?: number;
  momoNetwork?: string | null;
  momoNumber?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  bankName?: string | null;
  bankReference?: string | null;
  chequeNumber?: string | null;
  payerName?: string | null;
  payerPhone?: string | null;
  narration?: string | null;
  paidAt?: Date;
  receivedById?: string | null;
  /**
   * Explicit allocation. When omitted the payment is spread across the
   * student's outstanding invoices, oldest due date first.
   */
  allocations?: Array<{ invoiceId: string; amountMinor: number }>;
};

export async function recordPayment(input: RecordPaymentInput) {
  if (input.amountMinor <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const status = input.status ?? "SUCCESS";

  return db.$transaction(async (tx) => {
    let payment: { id: string; receiptNo: string } | null = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        payment = await tx.payment.create({
          data: {
            receiptNo: await nextReceiptNumber(attempt),
            reference: input.reference ?? `PAY-${generateCode(12)}`,
            studentId: input.studentId,
            guardianId: input.guardianId ?? null,
            amountMinor: input.amountMinor,
            feeMinor: input.feeMinor ?? 0,
            currency: input.currency ?? "GHS",
            channel: input.channel,
            provider: input.provider ?? "MANUAL",
            status,
            providerReference: input.providerReference ?? null,
            providerPayload: (input.providerPayload ?? undefined) as never,
            momoNetwork: input.momoNetwork ?? null,
            momoNumber: input.momoNumber ?? null,
            cardLast4: input.cardLast4 ?? null,
            cardBrand: input.cardBrand ?? null,
            bankName: input.bankName ?? null,
            bankReference: input.bankReference ?? null,
            chequeNumber: input.chequeNumber ?? null,
            payerName: input.payerName ?? null,
            payerPhone: input.payerPhone ?? null,
            narration: input.narration ?? null,
            paidAt: input.paidAt ?? new Date(),
            confirmedAt: status === "SUCCESS" ? new Date() : null,
            receivedById: input.receivedById ?? null,
          },
          select: { id: true, receiptNo: true },
        });
        break;
      } catch (error) {
        if (!isUniqueViolation(error, "receiptNo") || attempt === 3) throw error;
      }
    }

    if (!payment) throw new Error("Could not create the payment record.");

    // Only a settled payment moves an invoice balance.
    if (status !== "SUCCESS") return payment;

    const allocations =
      input.allocations ??
      (await planAllocation(tx, input.studentId, input.amountMinor));

    for (const allocation of allocations) {
      if (allocation.amountMinor <= 0) continue;

      // Capped at what the invoice actually owes. planAllocation works this
      // out, but an allocation chosen at the counter does not: a bursar typing
      // GH₵2,000 against a bill of GH₵1,500 wrote the whole 2,000 onto it. The
      // balance clamps at zero in refreshInvoiceTotals, so the extra 500
      // vanished — it did not become credit on the account, it stopped
      // existing, and the family's statement no longer matched the receipt
      // they were holding.
      const invoice = await tx.invoice.findUnique({
        where: { id: allocation.invoiceId },
        select: { balanceMinor: true },
      });
      const applied = Math.min(allocation.amountMinor, invoice?.balanceMinor ?? 0);
      if (applied <= 0) continue;

      await tx.paymentAllocation.create({
        data: {
          paymentId: payment.id,
          invoiceId: allocation.invoiceId,
          amountMinor: applied,
          allocatedBy: input.receivedById ?? null,
        },
      });
      await refreshInvoiceTotals(tx, allocation.invoiceId);
    }

    return payment;
  });
}

type TxClient = Prisma.TransactionClient;

/**
 * Oldest-debt-first allocation. Anything left over after every invoice is
 * settled stays unallocated and shows as a credit on the student's account.
 */
async function planAllocation(
  tx: TxClient,
  studentId: string,
  amountMinor: number,
): Promise<Array<{ invoiceId: string; amountMinor: number }>> {
  const invoices = await tx.invoice.findMany({
    where: {
      studentId,
      status: { in: ["ISSUED", "PART_PAID", "OVERDUE"] },
      balanceMinor: { gt: 0 },
    },
    orderBy: [{ dueDate: "asc" }, { issueDate: "asc" }],
    select: { id: true, balanceMinor: true },
  });

  const plan: Array<{ invoiceId: string; amountMinor: number }> = [];
  let remaining = amountMinor;

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, invoice.balanceMinor);
    plan.push({ invoiceId: invoice.id, amountMinor: applied });
    remaining -= applied;
  }

  return plan;
}

/** Recomputes paid/balance/status from the allocations that actually exist. */
export async function refreshInvoiceTotals(tx: TxClient, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { totalMinor: true, dueDate: true, status: true },
  });
  if (!invoice) return;

  const allocated = await tx.paymentAllocation.aggregate({
    where: { invoiceId, payment: { status: "SUCCESS" } },
    _sum: { amountMinor: true },
  });

  const paidMinor = allocated._sum.amountMinor ?? 0;
  const balanceMinor = Math.max(invoice.totalMinor - paidMinor, 0);

  let status: InvoiceStatus;
  if (invoice.status === "CANCELLED" || invoice.status === "WRITTEN_OFF") {
    status = invoice.status;
  } else if (balanceMinor === 0) {
    status = "PAID";
  } else if (paidMinor > 0) {
    status = "PART_PAID";
  } else if (invoice.dueDate && invoice.dueDate < new Date()) {
    status = "OVERDUE";
  } else {
    status = "ISSUED";
  }

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      paidMinor,
      balanceMinor,
      status,
      paidAt: balanceMinor === 0 ? new Date() : null,
    },
  });
}

/** Public wrapper for callers outside a transaction (webhooks, reconciliation). */
export async function recalculateInvoice(invoiceId: string) {
  await db.$transaction((tx) => refreshInvoiceTotals(tx, invoiceId));
}

/**
 * Spreads a confirmed payment across the student's oldest unpaid invoices.
 *
 * A payment started at a checkout has no allocations: nobody chose an invoice,
 * the parent just paid. Something has to decide where the money lands, and
 * until this existed each confirmation path decided for itself — the mock
 * checkout allocated, and the real gateway webhook looped over
 * `payment.allocations`, which for an online payment is empty. So a parent paid
 * through the live gateway, the payment went to SUCCESS, a receipt was issued,
 * and the invoice stayed fully outstanding. The school chased a parent who had
 * already paid.
 *
 * Oldest first by due date: it clears the debt that has been outstanding
 * longest, which is what a bursar does by hand and what stops an invoice
 * ageing into arrears while a newer one is settled.
 *
 * Idempotent. A gateway that delivers the same webhook twice — all of them do —
 * must not allocate twice, so an already-allocated payment is left alone.
 */
export async function allocatePaymentToOldestInvoices(
  paymentId: string,
): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: {
        studentId: true,
        amountMinor: true,
        allocations: { select: { id: true } },
      },
    });

    if (!payment) return [];
    if (payment.allocations.length > 0) return [];

    const invoices = await tx.invoice.findMany({
      where: {
        studentId: payment.studentId,
        balanceMinor: { gt: 0 },
        status: { in: ["ISSUED", "PART_PAID", "OVERDUE"] },
      },
      orderBy: [{ dueDate: "asc" }, { issueDate: "asc" }],
      select: { id: true, balanceMinor: true },
    });

    let remaining = payment.amountMinor;
    const touched: string[] = [];

    for (const invoice of invoices) {
      if (remaining <= 0) break;
      const applied = Math.min(remaining, invoice.balanceMinor);

      await tx.paymentAllocation.create({
        data: { paymentId, invoiceId: invoice.id, amountMinor: applied },
      });

      touched.push(invoice.id);
      remaining -= applied;
    }

    // Anything left over stays unallocated rather than being forced onto a
    // settled invoice. It shows as credit on the student's statement, which is
    // what an overpayment is.
    for (const invoiceId of touched) {
      await refreshInvoiceTotals(tx, invoiceId);
    }

    return touched;
  });
}

/** Marks issued invoices past their due date as overdue. Run from cron. */
export async function markOverdueInvoices(): Promise<number> {
  const result = await db.invoice.updateMany({
    where: {
      status: { in: ["ISSUED", "PART_PAID"] },
      dueDate: { lt: new Date() },
      balanceMinor: { gt: 0 },
    },
    data: { status: "OVERDUE" },
  });
  return result.count;
}

// -----------------------------------------------------------------------------
// Payment plans
// -----------------------------------------------------------------------------

/** Splits an outstanding balance into equal instalments, losing no pesewas. */
export async function createPaymentPlan(input: {
  studentId: string;
  name: string;
  totalMinor: number;
  instalments: number;
  startDate: Date;
  intervalDays?: number;
  invoiceId?: string | null;
  approvedBy?: string | null;
}) {
  const amounts = splitEvenly(input.totalMinor, input.instalments);
  const interval = input.intervalDays ?? 30;

  return db.paymentPlan.create({
    data: {
      studentId: input.studentId,
      name: input.name,
      totalMinor: input.totalMinor,
      startDate: input.startDate,
      approvedBy: input.approvedBy ?? null,
      installments: {
        create: amounts.map((amountMinor, index) => ({
          sequence: index + 1,
          amountMinor,
          invoiceId: input.invoiceId ?? null,
          dueDate: new Date(input.startDate.getTime() + index * interval * 86_400_000),
        })),
      },
    },
    include: { installments: { orderBy: { sequence: "asc" } } },
  });
}

// -----------------------------------------------------------------------------
// Statements
// -----------------------------------------------------------------------------

export type StudentStatement = {
  billedMinor: number;
  paidMinor: number;
  balanceMinor: number;
  creditMinor: number;
  invoices: Array<{
    id: string;
    invoiceNo: string;
    title: string | null;
    status: InvoiceStatus;
    totalMinor: number;
    paidMinor: number;
    balanceMinor: number;
    dueDate: Date | null;
    issueDate: Date;
  }>;
};

export async function getStudentStatement(studentId: string): Promise<StudentStatement> {
  const [invoices, payments, allocated] = await Promise.all([
    db.invoice.findMany({
      where: { studentId, status: { not: "DRAFT" } },
      orderBy: { issueDate: "desc" },
      select: {
        id: true,
        invoiceNo: true,
        title: true,
        status: true,
        totalMinor: true,
        paidMinor: true,
        balanceMinor: true,
        dueDate: true,
        issueDate: true,
      },
    }),
    db.payment.aggregate({
      where: { studentId, status: "SUCCESS" },
      _sum: { amountMinor: true },
    }),
    db.paymentAllocation.aggregate({
      where: { payment: { studentId, status: "SUCCESS" } },
      _sum: { amountMinor: true },
    }),
  ]);

  const active = invoices.filter(
    (invoice) => invoice.status !== "CANCELLED" && invoice.status !== "WRITTEN_OFF",
  );

  const receipted = payments._sum.amountMinor ?? 0;
  const appliedToInvoices = allocated._sum.amountMinor ?? 0;

  return {
    billedMinor: sumMinor(active.map((invoice) => invoice.totalMinor)),
    paidMinor: receipted,
    balanceMinor: sumMinor(active.map((invoice) => invoice.balanceMinor)),
    // Money received that no invoice has claimed yet.
    creditMinor: Math.max(receipted - appliedToInvoices, 0),
    invoices,
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function isUniqueViolation(error: unknown, field: string): boolean {
  const candidate = error as { code?: string; meta?: { target?: string[] | string } };
  if (candidate?.code !== "P2002") return false;
  const target = candidate.meta?.target;
  if (!target) return true;
  return Array.isArray(target) ? target.includes(field) : String(target).includes(field);
}
