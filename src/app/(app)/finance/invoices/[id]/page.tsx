import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Bell, Send, Wallet } from "lucide-react";

import { PrintButton } from "@/components/print-button";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  ProgressBar,
  StatusBadge,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, percentOf } from "@/lib/money";
import { formatDate, formatDateTime, humanise } from "@/lib/utils";

import { cancelInvoiceAction, issueInvoiceAction, sendInvoiceReminderAction } from "../../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const invoice = await db.invoice.findUnique({
    where: { id },
    select: { invoiceNo: true },
  });
  return { title: invoice ? `Invoice ${invoice.invoiceNo}` : "Invoice" };
}

export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("finance.read");
  const { id } = await params;

  const [invoice, school] = await Promise.all([
    db.invoice.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { sortKey: "asc" }, include: { category: true } },
        term: { select: { name: true } },
        academicYear: { select: { name: true } },
        allocations: {
          orderBy: { allocatedAt: "desc" },
          include: {
            payment: {
              select: {
                id: true,
                receiptNo: true,
                channel: true,
                paidAt: true,
                status: true,
                payerName: true,
              },
            },
          },
        },
        reminders: { orderBy: { sentAt: "desc" }, take: 10 },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            otherNames: true,
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
            guardians: {
              where: { isBillPayer: true },
              select: {
                guardian: { select: { firstName: true, lastName: true, phone: true } },
              },
            },
          },
        },
      },
    }),
    db.school.findFirst({
      select: {
        name: true,
        addressLine1: true,
        city: true,
        region: true,
        phone: true,
        email: true,
        logoUrl: true,
      },
    }),
  ]);

  if (!invoice) notFound();

  const section = invoice.student.enrollments[0]?.classSection;
  const paidShare = percentOf(invoice.paidMinor, invoice.totalMinor);
  const canIssue = userCan(user, "finance.invoice.create") && invoice.status === "DRAFT";
  const canCancel =
    userCan(user, "finance.invoice.update") &&
    invoice.status !== "CANCELLED" &&
    invoice.paidMinor === 0;

  async function remind() {
    "use server";
    await sendInvoiceReminderAction(invoice!.id);
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Invoice ${invoice.invoiceNo}`}
          description={`${invoice.academicYear.name}${invoice.term ? ` · ${invoice.term.name}` : ""}`}
          breadcrumb={
            <Link href="/finance/invoices" className="hover:text-[var(--text)]">
              Invoices
            </Link>
          }
          action={
            <>
              <StatusBadge status={invoice.status} />
              <PrintButton label="Print invoice" />
              {invoice.balanceMinor > 0 &&
              userCan(user, "finance.payment.record") ? (
                <Link
                  href={`/finance/payments/new?student=${invoice.student.id}&invoice=${invoice.id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-sm font-medium text-white hover:opacity-90"
                >
                  <Wallet className="size-4" />
                  Record payment
                </Link>
              ) : null}
            </>
          }
        />
      </div>

      {invoice.status === "CANCELLED" ? (
        <Alert tone="danger" className="mb-4 print:hidden">
          This invoice was cancelled {formatDate(invoice.cancelledAt)} and is excluded
          from all balances.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* The printable document */}
        <Card className="print:border-0 print:shadow-none">
          <CardBody className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
              <div>
                <h2 className="text-lg font-semibold">{school?.name ?? "School"}</h2>
                <p className="text-xs text-[var(--text-muted)]">
                  {[school?.addressLine1, school?.city, school?.region]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {[school?.phone, school?.email].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs tracking-wide text-[var(--text-muted)] uppercase">
                  Invoice
                </p>
                <p className="numeric text-lg font-semibold">{invoice.invoiceNo}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Issued {formatDate(invoice.issueDate)}
                </p>
                {invoice.dueDate ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Due {formatDate(invoice.dueDate)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                  Billed to
                </p>
                <p className="text-sm font-medium">
                  {invoice.student.firstName} {invoice.student.otherNames}{" "}
                  {invoice.student.lastName}
                </p>
                <p className="numeric text-xs text-[var(--text-muted)]">
                  {invoice.student.admissionNo}
                  {section
                    ? ` · ${section.classLevel.name} ${section.name}`
                    : ""}
                </p>
                {invoice.student.guardians.map((link, index) => (
                  <p key={index} className="text-xs text-[var(--text-muted)]">
                    {link.guardian.firstName} {link.guardian.lastName} ·{" "}
                    {link.guardian.phone}
                  </p>
                ))}
              </div>
              {invoice.title ? (
                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                    Description
                  </p>
                  <p className="text-sm">{invoice.title}</p>
                </div>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 text-right font-medium">Qty</th>
                    <th className="py-2 pr-3 text-right font-medium">Unit</th>
                    <th className="py-2 pr-3 text-right font-medium">Discount</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr
                      key={line.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <p>{line.description}</p>
                        {line.category ? (
                          <p className="text-xs text-[var(--text-subtle)]">
                            {line.category.name}
                          </p>
                        ) : null}
                      </td>
                      <td className="numeric py-2 pr-3 text-right">
                        {Number(line.quantity)}
                      </td>
                      <td className="numeric py-2 pr-3 text-right">
                        {formatMoney(line.unitPriceMinor)}
                      </td>
                      <td className="numeric py-2 pr-3 text-right">
                        {line.discountMinor
                          ? `−${formatMoney(line.discountMinor)}`
                          : "-"}
                      </td>
                      <td className="numeric py-2 text-right font-medium">
                        {formatMoney(line.amountMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Subtotal</span>
                <span className="numeric">{formatMoney(invoice.subtotalMinor)}</span>
              </div>
              {invoice.discountMinor > 0 ? (
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Discount</span>
                  <span className="numeric text-[var(--success)]">
                    −{formatMoney(invoice.discountMinor)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-[var(--border)] pt-1.5 font-semibold">
                <span>Total</span>
                <span className="numeric">{formatMoney(invoice.totalMinor)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Paid</span>
                <span className="numeric text-[var(--success)]">
                  {formatMoney(invoice.paidMinor)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-base font-semibold">
                <span>Balance</span>
                <span
                  className={`numeric ${invoice.balanceMinor > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}
                >
                  {formatMoney(invoice.balanceMinor)}
                </span>
              </div>
            </div>

            {invoice.notes ? (
              <p className="border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
                {invoice.notes}
              </p>
            ) : null}

            <p className="text-xs text-[var(--text-subtle)]">
              Part payments are accepted. Quote invoice {invoice.invoiceNo} on any
              transfer so it is matched to this account.
            </p>
          </CardBody>
        </Card>

        <div className="space-y-4 print:hidden">
          <Card>
            <CardHeader title="Collection" />
            <CardBody className="space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-[var(--text-muted)]">Paid</span>
                  <span className="numeric">{paidShare.toFixed(0)}%</span>
                </div>
                <ProgressBar
                  value={paidShare}
                  tone={paidShare >= 100 ? "success" : paidShare > 0 ? "warning" : "danger"}
                  label={`${paidShare.toFixed(0)}% paid`}
                />
              </div>

              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Amount</dt>
                  <dd className="numeric">{formatMoney(invoice.totalMinor)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-muted)]">Reminders sent</dt>
                  <dd className="numeric">{invoice.remindersSent}</dd>
                </div>
                {invoice.lastReminderAt ? (
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-muted)]">Last reminder</dt>
                    <dd>{formatDate(invoice.lastReminderAt)}</dd>
                  </div>
                ) : null}
              </dl>

              {canIssue ? (
                <form action={issueInvoiceAction}>
                  <input type="hidden" name="id" value={invoice.id} />
                  <Button type="submit" variant="outline" size="sm" className="w-full">
                    <Send className="size-3.5" />
                    Issue invoice
                  </Button>
                </form>
              ) : null}

              {invoice.balanceMinor > 0 &&
              userCan(user, "finance.reminder.manage") ? (
                <form action={remind}>
                  <Button type="submit" variant="outline" size="sm" className="w-full">
                    <Bell className="size-3.5" />
                    Send a reminder now
                  </Button>
                </form>
              ) : null}

              {canCancel ? (
                <form action={cancelInvoiceAction}>
                  <input type="hidden" name="id" value={invoice.id} />
                  <Button type="submit" variant="ghost" size="sm" className="w-full">
                    <Ban className="size-3.5" />
                    Cancel invoice
                  </Button>
                </form>
              ) : invoice.paidMinor > 0 && invoice.status !== "CANCELLED" ? (
                <p className="text-xs text-[var(--text-subtle)]">
                  This invoice cannot be cancelled because money has been receipted
                  against it. Reversing that is a refund, which is a separate
                  deliberate act.
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Payments applied"
              description="A payment is recorded once and allocated across invoices."
            />
            {invoice.allocations.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {invoice.allocations.map((allocation) => (
                  <li key={allocation.id} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/finance/payments/${allocation.payment.id}`}
                        className="numeric text-xs font-medium hover:text-[var(--primary)]"
                      >
                        {allocation.payment.receiptNo}
                      </Link>
                      <span className="numeric text-sm">
                        {formatMoney(allocation.amountMinor)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {humanise(allocation.payment.channel)} ·{" "}
                      {formatDate(allocation.payment.paidAt)}
                      {allocation.payment.payerName
                        ? ` · ${allocation.payment.payerName}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <p className="text-sm text-[var(--text-muted)]">
                  Nothing has been paid against this invoice yet.
                </p>
              </CardBody>
            )}
          </Card>

          {invoice.reminders.length ? (
            <Card>
              <CardHeader title="Reminder history" />
              <ul className="divide-y divide-[var(--border)]">
                {invoice.reminders.map((reminder) => (
                  <li key={reminder.id} className="px-5 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="neutral">{humanise(reminder.kind)}</Badge>
                      <span className="text-[var(--text-subtle)]">
                        {formatDateTime(reminder.sentAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[var(--text-muted)]">
                      Balance was {formatMoney(reminder.balanceAtSendMinor)} ·{" "}
                      {reminder.channels.map(humanise).join(", ")}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
