import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Lock, Smartphone } from "lucide-react";

import { Alert, Button, Card, CardBody } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { integrationConfig } from "@/lib/integrations/config";
import { allocatePaymentToOldestInvoices } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { notifyUsers } from "@/lib/messaging";

export const metadata: Metadata = { title: "Complete payment" };
export const dynamic = "force-dynamic";

/**
 * Stand-in for the provider's hosted checkout, used when PAYMENT_PROVIDER=mock.
 *
 * It exercises exactly the same confirmation path as a real webhook — pending
 * payment → confirmed → invoice recalculated → guardian notified — so the
 * whole fee loop can be demonstrated without a merchant account.
 */
/**
 * Who may approve this payment.
 *
 * Any signed-in account used to be enough, and the reference is the only other
 * thing needed. So a student, or a parent of an unrelated child, could open
 * this page against somebody else's pending payment and mark it SUCCESS —
 * clearing another family's fees against money that never moved. The page is a
 * simulator, but the row it writes is the real Payment row, and the invoice it
 * settles is the real invoice.
 */
async function mayApprove(userId: string, studentId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      staff: { select: { id: true } },
      student: { select: { id: true } },
      guardian: { select: { id: true } },
    },
  });
  if (!user) return false;

  // A bursar taking a payment over the counter.
  if (user.staff) return true;

  if (user.student) return user.student.id === studentId;

  if (user.guardian) {
    const link = await db.studentGuardian.findFirst({
      where: { guardianId: user.guardian.id, studentId },
      select: { id: true },
    });
    return Boolean(link);
  }

  return false;
}

export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  // The simulator exists to stand in for a gateway that is not configured. If
  // one IS configured the school is taking real money, and a page that marks
  // payments settled without any must not be reachable at all.
  if ((await integrationConfig()).payments.provider !== "mock") notFound();

  const user = await requireUser();
  const { reference } = await searchParams;
  if (!reference) notFound();

  const payment = await db.payment.findUnique({
    where: { reference },
    select: {
      id: true,
      studentId: true,
      amountMinor: true,
      status: true,
      channel: true,
      receiptNo: true,
      ussdCode: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  if (!payment) notFound();
  // Not a 403: telling an unrelated caller that this reference exists is
  // itself the leak.
  if (!(await mayApprove(user.id, payment.studentId))) notFound();

  async function confirm(formData: FormData) {
    "use server";

    // A Server Action is a POST endpoint of its own: the checks above ran when
    // the page was rendered and prove nothing about who is calling this.
    if ((await integrationConfig()).payments.provider !== "mock") notFound();
    const actor = await requireUser();

    const outcome = String(formData.get("outcome") ?? "success");
    const record = await db.payment.findUnique({
      where: { reference: reference! },
      include: { allocations: true, student: { select: { id: true } } },
    });
    if (!record) return;
    if (!(await mayApprove(actor.id, record.studentId))) notFound();
    // Re-approving a settled payment would allocate it a second time.
    if (record.status === "SUCCESS") redirect(`/portal/guardian?ref=${reference}`);

    if (outcome !== "success") {
      await db.payment.update({
        where: { id: record.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          failureReason: "Cancelled by the payer at checkout.",
        },
      });
      redirect(`/portal/guardian?ref=${reference}`);
    }

    await db.payment.update({
      where: { id: record.id },
      data: { status: "SUCCESS", confirmedAt: new Date(), paidAt: new Date() },
    });

    // Shared with the real gateway webhook. It used to be written out here and
    // only here, which is exactly why the live path settled nothing.
    await allocatePaymentToOldestInvoices(record.id);

    const guardians = await db.studentGuardian.findMany({
      where: { studentId: record.studentId, isBillPayer: true },
      select: { guardian: { select: { user: { select: { id: true } } } } },
    });
    const userIds = guardians
      .map((link) => link.guardian.user?.id)
      .filter((id): id is string => Boolean(id));

    if (userIds.length) {
      await notifyUsers(userIds, {
        title: "Payment received",
        body: `We have received ${formatMoney(record.amountMinor)}. Receipt ${record.receiptNo}.`,
        category: "FEE",
        url: "/portal/guardian",
      }).catch(() => undefined);
    }

    redirect(`/portal/guardian?ref=${reference}`);
  }

  if (payment.status === "SUCCESS") {
    redirect(`/portal/guardian?ref=${reference}`);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] p-6">
      <Card className="w-full max-w-sm">
        <div className="border-b border-[var(--border)] px-5 py-4 text-center">
          <span className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
            <Lock className="size-5" />
          </span>
          <p className="text-sm font-semibold">Secure checkout</p>
          <p className="text-xs text-[var(--text-subtle)]">Test gateway: no real money moves</p>
        </div>

        <CardBody className="space-y-4">
          <div className="text-center">
            <p className="text-xs text-[var(--text-muted)]">Amount due</p>
            <p className="numeric text-3xl font-semibold">
              {formatMoney(payment.amountMinor)}
            </p>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              School fees for {payment.student.firstName} {payment.student.lastName}
            </p>
          </div>

          {payment.channel === "MOBILE_MONEY" ? (
            <Alert tone="info">
              <span className="flex items-start gap-2">
                <Smartphone className="mt-0.5 size-4 shrink-0" />
                In production the payer receives a prompt on their phone to approve
                this payment.
              </span>
            </Alert>
          ) : null}

          {payment.channel === "USSD" && payment.ussdCode ? (
            <Alert tone="info">
              Dial <span className="numeric font-semibold">{payment.ussdCode}</span> and
              follow the prompts.
            </Alert>
          ) : null}

          <form action={confirm} className="space-y-2">
            <input type="hidden" name="outcome" value="success" />
            <Button type="submit" size="lg" className="w-full">
              Approve payment
            </Button>
          </form>

          <form action={confirm}>
            <input type="hidden" name="outcome" value="cancelled" />
            <Button type="submit" variant="ghost" size="sm" className="w-full">
              Cancel
            </Button>
          </form>

          <p className="numeric text-center text-[11px] text-[var(--text-subtle)]">
            Ref {reference}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
