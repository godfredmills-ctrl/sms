import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { PrintButton } from "@/components/print-button";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime, formatPhone, fullName, humanise } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const payment = await db.payment.findUnique({
    where: { id },
    select: { receiptNo: true },
  });
  return { title: payment ? `Receipt ${payment.receiptNo}` : "Receipt" };
}

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("finance.read");
  const { id } = await params;

  const [payment, school] = await Promise.all([
    db.payment.findUnique({
      where: { id },
      include: {
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
          },
        },
        guardian: { select: { firstName: true, lastName: true, phone: true } },
        allocations: {
          orderBy: { allocatedAt: "asc" },
          include: {
            invoice: {
              select: {
                id: true,
                invoiceNo: true,
                title: true,
                totalMinor: true,
                balanceMinor: true,
                term: { select: { name: true } },
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
      },
    }),
  ]);

  if (!payment) notFound();

  // receivedById references Staff without a declared relation.
  const cashier = payment.receivedById
    ? await db.staff.findUnique({
        where: { id: payment.receivedById },
        select: { firstName: true, lastName: true, title: true },
      })
    : null;

  const section = payment.student.enrollments[0]?.classSection;
  const allocated = payment.allocations.reduce(
    (sum, allocation) => sum + allocation.amountMinor,
    0,
  );
  const onAccount = Math.max(0, payment.amountMinor - allocated);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Receipt ${payment.receiptNo}`}
          breadcrumb={
            <Link href="/finance/payments" className="hover:text-[var(--text)]">
              Payments
            </Link>
          }
          action={
            <>
              <StatusBadge status={payment.status} />
              <PrintButton label="Print receipt" />
            </>
          }
        />
      </div>

      {payment.status === "FAILED" ? (
        <Alert tone="danger" className="mb-4 print:hidden">
          This payment failed{payment.failureReason ? `: ${payment.failureReason}` : ""}.
          It is kept on record so a disputed &ldquo;I already paid&rdquo; can be
          resolved from evidence rather than memory.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
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
                  Official receipt
                </p>
                <p className="numeric text-lg font-semibold">{payment.receiptNo}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {formatDateTime(payment.paidAt)}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-[var(--success-soft)] p-4 text-center">
              <p className="text-xs tracking-wide text-[var(--success)] uppercase">
                Amount received
              </p>
              <p className="numeric mt-1 text-3xl font-semibold text-[var(--success)]">
                {formatMoney(payment.amountMinor)}
              </p>
            </div>

            <DescriptionList
              items={[
                {
                  label: "Student",
                  value: `${payment.student.firstName} ${payment.student.lastName}`,
                },
                { label: "Admission number", value: payment.student.admissionNo },
                {
                  label: "Class",
                  value: section
                    ? `${section.classLevel.name} ${section.name}`
                    : "Unassigned",
                },
                { label: "Channel", value: humanise(payment.channel) },
                {
                  label: "Paid by",
                  value:
                    payment.payerName ??
                    (payment.guardian
                      ? `${payment.guardian.firstName} ${payment.guardian.lastName}`
                      : "—"),
                },
                {
                  label: "Payer phone",
                  value: formatPhone(payment.payerPhone ?? payment.momoNumber),
                },
                ...(payment.momoNetwork
                  ? [{ label: "Network", value: payment.momoNetwork }]
                  : []),
                ...(payment.cardLast4
                  ? [
                      {
                        label: "Card",
                        value: `${payment.cardBrand ?? "Card"} ···· ${payment.cardLast4}`,
                      },
                    ]
                  : []),
                ...(payment.bankName
                  ? [
                      { label: "Bank", value: payment.bankName },
                      { label: "Bank reference", value: payment.bankReference ?? "—" },
                    ]
                  : []),
                ...(payment.chequeNumber
                  ? [{ label: "Cheque number", value: payment.chequeNumber }]
                  : []),
                { label: "Reference", value: payment.reference, span: true },
                {
                  label: "Received by",
                  value: cashier ? fullName(cashier) : "Online",
                },
              ]}
            />

            {payment.narration ? (
              <p className="border-t border-[var(--border)] pt-3 text-sm">
                {payment.narration}
              </p>
            ) : null}

            <div className="flex items-center gap-2 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-subtle)]">
              <CheckCircle2 className="size-3.5 shrink-0 text-[var(--success)]" />
              Computer-generated receipt. Verify against reference {payment.reference}.
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4 print:hidden">
          <Card>
            <CardHeader
              title="Applied to"
              description="A payment is recorded once, then allocated. That is what makes part payments and credit balances behave."
            />
            {payment.allocations.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {payment.allocations.map((allocation) => (
                  <li key={allocation.id} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/finance/invoices/${allocation.invoice.id}`}
                        className="numeric text-xs font-medium hover:text-[var(--primary)]"
                      >
                        {allocation.invoice.invoiceNo}
                      </Link>
                      <span className="numeric text-sm">
                        {formatMoney(allocation.amountMinor)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {allocation.invoice.term?.name ?? allocation.invoice.title ?? "—"} ·
                      balance now {formatMoney(allocation.invoice.balanceMinor)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <p className="text-sm text-[var(--text-muted)]">
                  Not applied to any invoice.
                </p>
              </CardBody>
            )}

            {onAccount > 0 ? (
              <CardBody className="border-t border-[var(--border)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--text-muted)]">
                    Left on account
                  </span>
                  <Badge tone="warning">{formatMoney(onAccount)}</Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                  Held as a credit and applied automatically to the next bill raised
                  for this student.
                </p>
              </CardBody>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
