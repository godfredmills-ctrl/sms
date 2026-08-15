import type { Metadata } from "next";
import { Banknote, Receipt, Smartphone, TriangleAlert } from "lucide-react";

import { Alert, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { fullName } from "@/lib/utils";

import { PaymentsTable, type PaymentRow } from "./payments-table";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const user = await requirePermission("finance.read");

  const payments = await db.payment.findMany({
    orderBy: { paidAt: "desc" },
    take: 3000,
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

  const successful = rows.filter((row) => row.status === "SUCCESS");
  const total = successful.reduce((sum, row) => sum + row.amountMinor, 0);
  const fees = successful.reduce((sum, row) => sum + row.feeMinor, 0);
  const onAccount = successful.reduce((sum, row) => sum + row.unallocatedMinor, 0);
  const failed = rows.filter((row) => row.status === "FAILED").length;

  const momo = successful.filter((row) => row.channel === "MOBILE_MONEY");
  const momoShare = successful.length
    ? Math.round((momo.length / successful.length) * 100)
    : 0;

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every receipt issued, how it was paid, and what it has been applied to."
        action={
          userCan(user, "finance.payment.record") ? (
            <LinkButton href="/finance/payments/new" size="sm">
              <Receipt className="size-4" />
              Record payment
            </LinkButton>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Received"
          value={formatMoney(total)}
          hint={`${successful.length} receipts`}
          tone="success"
          icon={<Banknote className="size-4" />}
        />
        <StatCard
          label="Mobile money"
          value={`${momoShare}%`}
          hint={`${momo.length} payments`}
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
    </>
  );
}
