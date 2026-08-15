import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Receipt, TriangleAlert, Wallet } from "lucide-react";

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
import { getStudentStatement } from "@/lib/finance";
import { formatMoney, percentOf } from "@/lib/money";
import { formatDate, formatPercent, fullName } from "@/lib/utils";

import { NotLinked } from "../not-linked";
import { wardsFor } from "../wards";

export const metadata: Metadata = { title: "Fee Account" };
export const dynamic = "force-dynamic";

export default async function GuardianFeesPage() {
  const user = await requireUser();
  if (!user.guardianId) return <NotLinked title="Fee Account" />;

  const links = await wardsFor(user.guardianId);
  if (!links.length) return <NotLinked title="Fee Account" />;

  const statements = await Promise.all(
    links.map((link) => getStudentStatement(link.student.id)),
  );

  const billed = statements.reduce((sum, entry) => sum + entry.billedMinor, 0);
  const paid = statements.reduce((sum, entry) => sum + entry.paidMinor, 0);
  const balance = statements.reduce((sum, entry) => sum + entry.balanceMinor, 0);

  const now = new Date();
  const overdue = statements
    .flatMap((statement) => statement.invoices)
    .filter(
      (invoice) =>
        invoice.balanceMinor > 0 && invoice.dueDate && invoice.dueDate < now,
    );
  const overdueValue = overdue.reduce((sum, invoice) => sum + invoice.balanceMinor, 0);

  return (
    <>
      <PageHeader
        title="Fee account"
        description="Every bill raised for your children and what remains on it."
        action={
          balance > 0 ? (
            <Link
              href="/portal/guardian"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-sm font-medium text-white hover:opacity-90"
            >
              <Wallet className="size-4" />
              Pay now
            </Link>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Billed"
          value={formatMoney(billed, "GHS", { compact: true })}
          tone="info"
          icon={<FileText className="size-4" />}
        />
        <StatCard
          label="Paid"
          value={formatMoney(paid, "GHS", { compact: true })}
          hint={formatPercent(percentOf(paid, billed))}
          tone="success"
          icon={<Receipt className="size-4" />}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(balance, "GHS", { compact: true })}
          tone={balance > 0 ? "warning" : "success"}
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Overdue"
          value={formatMoney(overdueValue, "GHS", { compact: true })}
          hint={`${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`}
          tone={overdue.length ? "danger" : "success"}
          icon={<TriangleAlert className="size-4" />}
        />
      </div>

      {balance > 0 ? (
        <Alert tone="info" className="mb-4">
          Part payments are accepted. Any amount you send reduces the balance
          immediately and is receipted — you do not have to wait until you can pay a
          term in full.
        </Alert>
      ) : null}

      <div className="space-y-4">
        {links.map((link, index) => {
          const statement = statements[index];
          const share = percentOf(statement.paidMinor, statement.billedMinor);

          return (
            <Card key={link.student.id}>
              <CardHeader
                title={fullName(link.student)}
                description={`${link.student.admissionNo}${
                  link.isBillPayer ? " · you are listed as a bill payer" : ""
                }`}
                action={
                  <span
                    className={`numeric text-sm font-semibold ${
                      statement.balanceMinor > 0
                        ? "text-[var(--danger)]"
                        : "text-[var(--success)]"
                    }`}
                  >
                    {formatMoney(statement.balanceMinor)}
                  </span>
                }
              />

              <CardBody className="space-y-3">
                <ProgressBar
                  value={share}
                  tone={share >= 100 ? "success" : share > 0 ? "warning" : "danger"}
                  label={`${fullName(link.student)} fees ${share.toFixed(0)}% paid`}
                />

                {statement.invoices.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                          <th className="py-1.5 pr-3 font-medium">Invoice</th>
                          <th className="py-1.5 pr-3 font-medium">Due</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Total</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Paid</th>
                          <th className="py-1.5 pr-3 text-right font-medium">Balance</th>
                          <th className="py-1.5 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statement.invoices.map((invoice) => (
                          <tr
                            key={invoice.id}
                            className="border-b border-[var(--border)] last:border-0"
                          >
                            <td className="numeric py-1.5 pr-3">{invoice.invoiceNo}</td>
                            <td className="py-1.5 pr-3 text-[var(--text-muted)]">
                              {formatDate(invoice.dueDate)}
                            </td>
                            <td className="numeric py-1.5 pr-3 text-right">
                              {formatMoney(invoice.totalMinor)}
                            </td>
                            <td className="numeric py-1.5 pr-3 text-right text-[var(--success)]">
                              {formatMoney(invoice.paidMinor)}
                            </td>
                            <td
                              className={`numeric py-1.5 pr-3 text-right ${
                                invoice.balanceMinor > 0
                                  ? "font-medium text-[var(--danger)]"
                                  : ""
                              }`}
                            >
                              {formatMoney(invoice.balanceMinor)}
                            </td>
                            <td className="py-1.5">
                              <StatusBadge status={invoice.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState title="No invoices raised yet" />
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
