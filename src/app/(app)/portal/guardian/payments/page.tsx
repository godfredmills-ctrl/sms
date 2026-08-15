import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Receipt, Smartphone } from "lucide-react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime, fullName, humanise } from "@/lib/utils";

import { NotLinked } from "../not-linked";
import { wardIdsFor } from "../wards";

export const metadata: Metadata = { title: "Payment History" };
export const dynamic = "force-dynamic";

export default async function GuardianPaymentsPage() {
  const user = await requireUser();
  if (!user.guardianId) return <NotLinked title="Payment History" />;

  const studentIds = await wardIdsFor(user.guardianId);
  if (!studentIds.length) return <NotLinked title="Payment History" />;

  const payments = await db.payment.findMany({
    where: { studentId: { in: studentIds } },
    orderBy: { paidAt: "desc" },
    take: 200,
    include: {
      student: { select: { firstName: true, lastName: true, otherNames: true } },
      allocations: {
        include: {
          invoice: { select: { id: true, invoiceNo: true, term: { select: { name: true } } } },
        },
      },
    },
  });

  const successful = payments.filter((payment) => payment.status === "SUCCESS");
  const total = successful.reduce((sum, payment) => sum + payment.amountMinor, 0);
  const thisYear = successful.filter(
    (payment) => payment.paidAt.getFullYear() === new Date().getFullYear(),
  );
  const momo = successful.filter((payment) => payment.channel === "MOBILE_MONEY").length;

  return (
    <>
      <PageHeader
        title="Payment history"
        description="Every payment received on your children's accounts, with its receipt."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Paid to date"
          value={formatMoney(total, "GHS", { compact: true })}
          hint={`${successful.length} payments`}
          tone="success"
          icon={<Banknote className="size-4" />}
        />
        <StatCard
          label="This year"
          value={formatMoney(
            thisYear.reduce((sum, payment) => sum + payment.amountMinor, 0),
            "GHS",
            { compact: true },
          )}
          tone="violet"
        />
        <StatCard
          label="By mobile money"
          value={momo}
          tone="info"
          icon={<Smartphone className="size-4" />}
        />
        <StatCard
          label="Receipts"
          value={successful.length}
          tone="teal"
          icon={<Receipt className="size-4" />}
        />
      </div>

      <Card>
        <CardHeader
          title="Receipts"
          description="Each payment is applied to one or more invoices — the breakdown is shown against every receipt."
        />
        {payments.length ? (
          <ul className="divide-y divide-[var(--border)]">
            {payments.map((payment) => (
              <li key={payment.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="numeric text-sm font-medium">
                        {payment.receiptNo}
                      </span>
                      <Badge tone="info">{humanise(payment.channel)}</Badge>
                      {payment.status !== "SUCCESS" ? (
                        <StatusBadge status={payment.status} />
                      ) : null}
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {fullName(payment.student)} · {formatDateTime(payment.paidAt)}
                      {payment.payerName ? ` · ${payment.payerName}` : ""}
                    </p>

                    {payment.allocations.length ? (
                      <ul className="mt-1 space-y-0.5">
                        {payment.allocations.map((allocation) => (
                          <li key={allocation.id} className="text-xs">
                            <Link
                              href={`/portal/guardian/fees`}
                              className="text-[var(--text-subtle)] hover:text-[var(--primary)]"
                            >
                              {allocation.invoice.invoiceNo}
                              {allocation.invoice.term
                                ? ` (${allocation.invoice.term.name})`
                                : ""}{" "}
                              — {formatMoney(allocation.amountMinor)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : payment.status === "SUCCESS" ? (
                      <p className="mt-1 text-xs text-[var(--warning)]">
                        Held as credit — applied to the next bill raised.
                      </p>
                    ) : null}
                  </div>

                  <span
                    className={`numeric shrink-0 text-sm font-semibold ${
                      payment.status === "SUCCESS"
                        ? "text-[var(--success)]"
                        : "text-[var(--text-subtle)]"
                    }`}
                  >
                    {formatMoney(payment.amountMinor)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Receipt className="size-5" />}
            title="No payments yet"
            description="Payments you make will appear here with a receipt number."
          />
        )}
      </Card>
    </>
  );
}
