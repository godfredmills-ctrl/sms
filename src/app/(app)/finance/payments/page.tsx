import type { Metadata } from "next";
import { Banknote, Receipt, Smartphone, TriangleAlert } from "lucide-react";

import { Alert, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { Pager, pageOf } from "@/components/pager";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { fullName } from "@/lib/utils";

import { PaymentsTable, type PaymentRow } from "./payments-table";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("finance.read");

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);

  // Every figure on this page describes the whole ledger, so every one of them
  // is aggregated in the database. Summing the rows on screen would turn
  // "GH₵1.2m collected" into "GH₵1.2m collected on this page", and it would
  // shrink as a bursar paged backwards through the year.
  const [totalPayments, successAgg, allocatedAgg, failed, momoCount, successCount] =
    await Promise.all([
      db.payment.count(),
      db.payment.aggregate({
        where: { status: "SUCCESS" },
        _sum: { amountMinor: true, feeMinor: true },
      }),
      db.paymentAllocation.aggregate({
        where: { payment: { status: "SUCCESS" } },
        _sum: { amountMinor: true },
      }),
      db.payment.count({ where: { status: "FAILED" } }),
      db.payment.count({ where: { status: "SUCCESS", channel: "MOBILE_MONEY" } }),
      db.payment.count({ where: { status: "SUCCESS" } }),
    ]);

  const total = successAgg._sum.amountMinor ?? 0;
  const fees = successAgg._sum.feeMinor ?? 0;
  // Money taken but not yet applied to a bill — a credit sitting on account.
  const onAccount = Math.max(total - (allocatedAgg._sum.amountMinor ?? 0), 0);
  const momoShare = successCount
    ? Math.round((momoCount / successCount) * 100)
    : 0;

  const payments = await db.payment.findMany({
    orderBy: { paidAt: "desc" },
    skip,
    take,
    select: {
      id: true,
      receiptNo: true,
      reference: true,
      amountMinor: true,
      feeMinor: true,
      channel: true,
      provider: true,
      status: true,
      payerName: true,
      paidAt: true,
      receivedById: true,
      allocations: { select: { amountMinor: true } },
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNo: true,
          enrollments: {
            where: { status: "ACTIVE" },
            take: 1,
            select: {
              classSection: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  // receivedById points at Staff without a declared relation, so the names are
  // resolved in one extra query rather than one per row.
  const cashiers = new Map(
    (
      await db.staff.findMany({
        where: {
          id: {
            in: [
              ...new Set(
                payments
                  .map((payment) => payment.receivedById)
                  .filter((id): id is string => Boolean(id)),
              ),
            ],
          },
        },
        select: { id: true, firstName: true, lastName: true, title: true },
      })
    ).map((staff) => [staff.id, fullName(staff)]),
  );

  const rows: PaymentRow[] = payments.map((payment) => {
    const section = payment.student.enrollments[0]?.classSection;
    const allocated = payment.allocations.reduce(
      (sum, allocation) => sum + allocation.amountMinor,
      0,
    );

    return {
      id: payment.id,
      receiptNo: payment.receiptNo,
      reference: payment.reference,
      studentName: `${payment.student.firstName} ${payment.student.lastName}`,
      admissionNo: payment.student.admissionNo,
      className: section ? `${section.classLevel.name} ${section.name}` : "Unassigned",
      amountMinor: payment.amountMinor,
      feeMinor: payment.feeMinor,
      allocatedMinor: allocated,
      // Money received that no invoice has claimed yet — a credit sitting on
      // the account, which is normal for advance payments and a red flag when
      // it lingers on an account that also has an unpaid bill.
      unallocatedMinor:
        payment.status === "SUCCESS" ? Math.max(0, payment.amountMinor - allocated) : 0,
      channel: payment.channel,
      provider: payment.provider,
      status: payment.status,
      payerName: payment.payerName,
      paidAt: payment.paidAt.toISOString(),
      receivedBy: payment.receivedById
        ? (cashiers.get(payment.receivedById) ?? null)
        : null,
    };
  });

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every receipt issued, how it was paid, and what it has been applied to."
        action={
          <>
            <RefreshButton />
            {userCan(user, "finance.payment.record") ? (
              <LinkButton href="/finance/payments/new" size="sm">
                <Receipt className="size-4" />
                Record payment
              </LinkButton>
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Received"
          value={formatMoney(total)}
          hint={`${successCount.toLocaleString()} receipts`}
          tone="success"
          icon={<Banknote className="size-4" />}
        />
        <StatCard
          label="Mobile money"
          value={`${momoShare}%`}
          hint={`${momoCount.toLocaleString()} payments`}
          tone="violet"
          icon={<Smartphone className="size-4" />}
        />
        <StatCard
          label="Unapplied credit"
          value={formatMoney(onAccount)}
          hint="Received but not matched to an invoice"
          tone={onAccount > 0 ? "warning" : "success"}
          icon={<TriangleAlert className="size-4" />}
        />
        <StatCard
          label="Provider fees"
          value={formatMoney(fees)}
          hint="Borne by the school"
          tone="neutral"
        />
      </div>

      {failed > 0 ? (
        <Alert tone="warning" className="mb-4">
          {failed} payment{failed === 1 ? " attempt" : " attempts"} failed. Failed
          attempts are kept deliberately — a parent who says they paid usually has a
          failed attempt behind them, and the record is what settles it.
        </Alert>
      ) : null}

      <PaymentsTable rows={rows} />

      <Pager
        basePath="/finance/payments"
        searchParams={params}
        page={page}
        perPage={PER_PAGE}
        total={totalPayments}
        label="payments"
      />
    </>
  );
}
