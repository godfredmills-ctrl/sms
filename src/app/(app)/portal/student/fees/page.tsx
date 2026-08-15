import type { Metadata } from "next";
import { FileText, Receipt, Wallet } from "lucide-react";

import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStudentStatement } from "@/lib/finance";
import { formatMoney, percentOf } from "@/lib/money";
import { formatDate, formatPercent, humanise } from "@/lib/utils";

import { NotLinked } from "../not-linked";

export const metadata: Metadata = { title: "My Fees" };
export const dynamic = "force-dynamic";

export default async function StudentFeesPage() {
  const user = await requireUser();
  if (!user.studentId) return <NotLinked title="My Fees" />;

  const [statement, payments] = await Promise.all([
    getStudentStatement(user.studentId),
    db.payment.findMany({
      where: { studentId: user.studentId, status: "SUCCESS" },
      orderBy: { paidAt: "desc" },
      take: 30,
      select: {
        id: true,
        receiptNo: true,
        amountMinor: true,
        channel: true,
        paidAt: true,
        payerName: true,
      },
    }),
  ]);

  const paidShare = percentOf(statement.paidMinor, statement.billedMinor);

  return (
    <>
      <PageHeader
        title="My fees"
        description="What has been billed, what has been paid, and what is still owed."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Billed"
          value={formatMoney(statement.billedMinor)}
          tone="info"
          icon={<FileText className="size-4" />}
        />
        <StatCard
          label="Paid"
          value={formatMoney(statement.paidMinor)}
          hint={formatPercent(paidShare)}
          tone="success"
          icon={<Receipt className="size-4" />}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(statement.balanceMinor)}
          tone={statement.balanceMinor > 0 ? "warning" : "success"}
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Invoices"
          value={statement.invoices.length}
          tone="violet"
        />
      </div>

      {statement.balanceMinor > 0 ? (
        <Alert tone="info" className="mb-4">
          Part payments are accepted — any amount reduces the balance and is
          receipted immediately. Ask your parent or guardian to pay through their
          portal, or at the school office.
        </Alert>
      ) : (
        <Alert tone="success" className="mb-4">
          Your fee account is fully settled. Thank you.
        </Alert>
      )}

      <div className="mb-4">
        <Card>
          <CardBody>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-[var(--text-muted)]">Overall settlement</span>
              <span className="numeric font-medium">{formatPercent(paidShare)}</span>
            </div>
            <ProgressBar
              value={paidShare}
              tone={paidShare >= 100 ? "success" : paidShare > 0 ? "warning" : "danger"}
              label={`${paidShare.toFixed(0)}% of fees paid`}
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Invoices" />
          {statement.invoices.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {statement.invoices.map((invoice) => (
                <li key={invoice.id} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="numeric text-sm font-medium">
                      {invoice.invoiceNo}
                    </span>
                    <StatusBadge status={invoice.status} />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-[var(--text-subtle)]">
                      {invoice.dueDate ? `Due ${formatDate(invoice.dueDate)}` : "No due date"}
                    </span>
                    <span className="numeric">
                      {formatMoney(invoice.paidMinor)} of{" "}
                      {formatMoney(invoice.totalMinor)}
                    </span>
                  </div>
                  {invoice.balanceMinor > 0 ? (
                    <p className="numeric mt-0.5 text-xs font-medium text-[var(--danger)]">
                      {formatMoney(invoice.balanceMinor)} outstanding
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<FileText className="size-5" />} title="No invoices" />
          )}
        </Card>

        <Card>
          <CardHeader title="Payments received" />
          {payments.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="numeric text-sm font-medium">{payment.receiptNo}</p>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {humanise(payment.channel)} · {formatDate(payment.paidAt)}
                      {payment.payerName ? ` · ${payment.payerName}` : ""}
                    </p>
                  </div>
                  <span className="numeric shrink-0 text-sm font-medium text-[var(--success)]">
                    {formatMoney(payment.amountMinor)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Receipt className="size-5" />} title="No payments yet" />
          )}
        </Card>
      </div>
    </>
  );
}
