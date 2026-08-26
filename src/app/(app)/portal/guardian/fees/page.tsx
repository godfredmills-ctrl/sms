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
import { db } from "@/lib/db";
import { getStudentStatement } from "@/lib/finance";
import { formatMoney, percentOf } from "@/lib/money";
import { getGateway } from "@/lib/payments";
import { settlePayment, type Settlement } from "@/lib/payments/settle";
import { formatDate, formatPercent, fullName } from "@/lib/utils";

import { NotLinked } from "../not-linked";
import { wardsFor } from "../wards";

export const metadata: Metadata = { title: "Fee Account" };
export const dynamic = "force-dynamic";

/**
 * The payer comes back here from the provider with `?ref=` on the URL.
 *
 * That reference was being ignored entirely: a parent finished paying on
 * Paystack, was redirected to this page, and saw the balance they had before
 * they paid, with nothing to say the payment had happened. Whether it settled
 * depended on a webhook arriving in the seconds in between.
 *
 * So the reference is used: the provider is asked directly what became of it,
 * and the payment is settled through the same function the webhook uses. The
 * parent then sees the answer, and the balance below it is the balance after
 * their payment.
 *
 * Scoped to this guardian's own payments. Settling somebody else's payment
 * would do no harm — it only writes down what the provider says is true — but
 * reporting back a receipt number and an amount would tell one family what
 * another had paid.
 */
async function settleOnReturn(
  guardianId: string,
  reference: string,
): Promise<(Settlement & { studentName?: string }) | null> {
  const payment = await db.payment.findFirst({
    where: {
      reference,
      student: { guardians: { some: { guardianId } } },
    },
    select: {
      status: true,
      provider: true,
      receiptNo: true,
      amountMinor: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  if (!payment) return null;

  const studentName = `${payment.student.firstName} ${payment.student.lastName}`;

  /**
   * Only a payment that went to a real gateway may be settled from here.
   *
   * `getGateway` falls back to the mock for any name it does not recognise, and
   * the mock's `verify` answers SUCCESS unconditionally — that is what makes it
   * useful for rehearsing the fee flow, and lethal afterwards. A school that
   * pilots on the test gateway and then switches to Paystack is left holding
   * PROCESSING rows stamped provider=MOCK against real invoices, and the
   * reference to each one is sitting in the parent's own browser history. Load
   * this page with it and the mock cheerfully confirms a payment that never
   * happened, clearing thousands of cedis of real fees.
   *
   * `/pay/mock` already refuses to run once a live provider is configured. This
   * is the same guard, in the place the same danger reappeared — and it matches
   * what the sweep already does, which restricts itself to real providers.
   */
  const settleable = payment.provider === "PAYSTACK" || payment.provider === "HUBTEL";

  // Already settled — the common case, and the fast path. Still worth asking
  // whether it was ever applied: settling and allocating are separate commits.
  if (payment.status === "SUCCESS") {
    await settlePayment(reference, { ok: true, status: "SUCCESS" });
    return {
      outcome: "already-settled",
      receiptNo: payment.receiptNo,
      amountMinor: payment.amountMinor,
      studentName,
    };
  }

  if (!settleable) return null;

  try {
    // The gateway this payment was created with, not whichever is configured
    // now — see the note in reconcilePendingPayments.
    const gateway = await getGateway(payment.provider.toLowerCase());
    const result = await gateway.verify(reference);
    if (!result.ok) return { outcome: "still-pending", studentName };
    return { ...(await settlePayment(reference, result)), studentName };
  } catch {
    // A provider that will not answer is not a failed payment. Say nothing
    // definite rather than telling a parent their money did not arrive.
    return { outcome: "still-pending", studentName };
  }
}

/**
 * What the parent is told when they come back from paying.
 *
 * Written for somebody who has just sent money and wants to know it arrived.
 * "Still confirming" is a real and common answer for mobile money — the
 * important part is that it never reads as failure, and never asks them to pay
 * again.
 */
function PaymentOutcome({
  settlement,
}: {
  settlement: Settlement & { studentName?: string };
}) {
  const forChild = settlement.studentName ? ` for ${settlement.studentName}` : "";

  switch (settlement.outcome) {
    case "settled":
    case "already-settled":
      return (
        <Alert tone="success" className="mb-4">
          <strong>Payment received.</strong> {formatMoney(settlement.amountMinor)}
          {forChild} has been applied to the oldest unpaid bill first. Your receipt
          number is <strong>{settlement.receiptNo}</strong>: the figures below
          already include it.
        </Alert>
      );

    case "still-pending":
      return (
        <Alert tone="info" className="mb-4">
          <strong>Still confirming your payment.</strong> Mobile money can take a
          few minutes to be confirmed by the network. There is no need to pay
          again: refresh this page shortly, and you will be notified as soon as
          it clears.
        </Alert>
      );

    case "not-successful":
      return (
        <Alert tone="warning" className="mb-4">
          <strong>That payment did not go through</strong>
          {settlement.reason ? `: ${settlement.reason}` : "."} Nothing has been
          charged. You can try again, or pay at the school office.
        </Alert>
      );

    case "rejected":
      return (
        <Alert tone="danger" className="mb-4">
          <strong>Something is wrong with that payment</strong> and it has been
          held rather than applied to your account. Please contact the school
          office and quote the payment you have just made: do not pay again.
        </Alert>
      );

    default:
      return null;
  }
}

export default async function GuardianFeesPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const user = await requireUser();
  if (!user.guardianId) return <NotLinked title="Fee Account" />;

  const links = await wardsFor(user.guardianId);
  if (!links.length) return <NotLinked title="Fee Account" />;

  // Before the statement is read, so the figures below already include this
  // payment. Reading them first would show the parent the balance from before
  // the money they just sent.
  const { ref } = await searchParams;
  const settlement = ref ? await settleOnReturn(user.guardianId, ref) : null;

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

      {settlement ? <PaymentOutcome settlement={settlement} /> : null}

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
          immediately and is receipted: you do not have to wait until you can pay a
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
