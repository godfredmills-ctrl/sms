import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, CheckCircle2, Landmark, Smartphone, Trash2 } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { parseAllowances, payrollPeriodLabel } from "@/lib/payroll";
import { formatDate } from "@/lib/utils";

import { advanceRunFormAction, deletePayrollRunAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const run = await db.payrollRun.findUnique({
    where: { id },
    select: { year: true, month: true },
  });
  return { title: run ? payrollPeriodLabel(run.year, run.month) : "Payroll run" };
}

/**
 * One month's payroll: every payslip, the totals a bursar reconciles
 * against the bank, and the two buttons that move it forward.
 */
export default async function PayrollRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("payroll.read");
  const canApprove = userCan(user, "payroll.approve");
  const canManage = userCan(user, "payroll.manage");
  const { id } = await params;

  const run = await db.payrollRun.findUnique({
    where: { id },
    select: {
      id: true,
      year: true,
      month: true,
      status: true,
      approvedBy: true,
      approvedAt: true,
      paidAt: true,
      payslips: {
        orderBy: { staffName: "asc" },
        select: {
          id: true,
          staffId: true,
          staffName: true,
          staffNo: true,
          basicMinor: true,
          allowances: true,
          grossMinor: true,
          ssnitEmployeeMinor: true,
          ssnitEmployerMinor: true,
          payeMinor: true,
          netMinor: true,
          paymentMethod: true,
        },
      },
    },
  });

  if (!run) notFound();

  const totals = run.payslips.reduce(
    (sums, slip) => ({
      gross: sums.gross + slip.grossMinor,
      ssnitEmployee: sums.ssnitEmployee + slip.ssnitEmployeeMinor,
      ssnitEmployer: sums.ssnitEmployer + slip.ssnitEmployerMinor,
      paye: sums.paye + slip.payeMinor,
      net: sums.net + slip.netMinor,
    }),
    { gross: 0, ssnitEmployee: 0, ssnitEmployer: 0, paye: 0, net: 0 },
  );

  // What the school actually parts with: net pay plus both SSNIT halves and
  // the PAYE it remits — the figure a head teacher asks for.
  const employerCost = totals.gross + totals.ssnitEmployer;

  return (
    <>
      <PageHeader
        title={payrollPeriodLabel(run.year, run.month)}
        description={`${run.payslips.length} payslip${run.payslips.length === 1 ? "" : "s"} · ${
          run.status === "DRAFT" ? "Draft" : run.status === "APPROVED" ? "Approved" : "Paid"
        }`}
        action={
          <>
            <LinkButton href="/payroll" variant="ghost" size="sm">
              All runs
            </LinkButton>
            {run.status === "DRAFT" && canApprove ? (
              <form action={advanceRunFormAction}>
                <input type="hidden" name="id" value={run.id} />
                <input type="hidden" name="to" value="APPROVED" />
                <Button type="submit" size="sm">
                  <CheckCircle2 className="size-4" />
                  Approve
                </Button>
              </form>
            ) : null}
            {run.status === "APPROVED" && canApprove ? (
              <form action={advanceRunFormAction}>
                <input type="hidden" name="id" value={run.id} />
                <input type="hidden" name="to" value="PAID" />
                <Button type="submit" size="sm">
                  <Banknote className="size-4" />
                  Mark paid
                </Button>
              </form>
            ) : null}
            {run.status === "DRAFT" && canManage ? (
              <form action={deletePayrollRunAction}>
                <input type="hidden" name="id" value={run.id} />
                <Button type="submit" variant="outline" size="sm">
                  <Trash2 className="size-4" />
                  Discard
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      {run.status === "DRAFT" ? (
        <Alert tone="warning" className="mb-4">
          This run is a draft. Check the figures, then have it approved by someone
          other than whoever prepared it — that separation is the point of the two
          steps.
        </Alert>
      ) : run.status === "APPROVED" ? (
        <Alert tone="info" className="mb-4">
          Approved by {run.approvedBy}
          {run.approvedAt ? ` on ${formatDate(run.approvedAt, "long")}` : ""}. Mark it
          paid once the transfers have gone out.
        </Alert>
      ) : (
        <Alert tone="success" className="mb-4">
          Paid{run.paidAt ? ` on ${formatDate(run.paidAt, "long")}` : ""}. Staff can see
          their payslips in the portal.
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Gross" value={formatMoney(totals.gross, "GHS", { compact: true })} tone="violet" />
        <StatCard
          label="SSNIT (5.5% + 13%)"
          value={formatMoney(totals.ssnitEmployee + totals.ssnitEmployer, "GHS", { compact: true })}
          hint={`${formatMoney(totals.ssnitEmployee, "GHS", { compact: true })} staff · ${formatMoney(totals.ssnitEmployer, "GHS", { compact: true })} school`}
          tone="info"
        />
        <StatCard label="PAYE" value={formatMoney(totals.paye, "GHS", { compact: true })} tone="warning" />
        <StatCard
          label="Net pay"
          value={formatMoney(totals.net, "GHS", { compact: true })}
          hint="What staff receive"
          tone="success"
        />
        <StatCard
          label="Cost to school"
          value={formatMoney(employerCost, "GHS", { compact: true })}
          hint="Gross plus employer SSNIT"
          tone="neutral"
        />
      </div>

      <Card>
        <CardHeader title="Payslips" description="Figures frozen when the run was opened." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-5 py-2 font-medium">Staff</th>
                <th className="px-3 py-2 text-right font-medium">Basic</th>
                <th className="px-3 py-2 text-right font-medium">Allowances</th>
                <th className="px-3 py-2 text-right font-medium">Gross</th>
                <th className="px-3 py-2 text-right font-medium">SSNIT</th>
                <th className="px-3 py-2 text-right font-medium">PAYE</th>
                <th className="px-3 py-2 text-right font-medium">Net</th>
                <th className="px-5 py-2 font-medium">Paid by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {run.payslips.map((slip) => {
                const allowances = parseAllowances(slip.allowances);
                const allowanceTotal = allowances.reduce(
                  (sum, entry) => sum + entry.amountMinor,
                  0,
                );
                return (
                  <tr key={slip.id}>
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/staff/${slip.staffId}`}
                        className="font-medium hover:text-[var(--primary)]"
                      >
                        {slip.staffName}
                      </Link>
                      <span className="ml-2 text-xs text-[var(--text-subtle)]">
                        {slip.staffNo}
                      </span>
                    </td>
                    <td className="numeric px-3 py-2.5 text-right">
                      {formatMoney(slip.basicMinor, "GHS")}
                    </td>
                    <td
                      className="numeric px-3 py-2.5 text-right text-[var(--text-muted)]"
                      title={allowances.map((entry) => entry.name).join(", ") || undefined}
                    >
                      {allowanceTotal ? formatMoney(allowanceTotal, "GHS") : "—"}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right">
                      {formatMoney(slip.grossMinor, "GHS")}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-[var(--text-muted)]">
                      {formatMoney(slip.ssnitEmployeeMinor, "GHS")}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right text-[var(--text-muted)]">
                      {formatMoney(slip.payeMinor, "GHS")}
                    </td>
                    <td className="numeric px-3 py-2.5 text-right font-semibold">
                      {formatMoney(slip.netMinor, "GHS")}
                    </td>
                    <td className="px-5 py-2.5">
                      <Badge tone={slip.paymentMethod === "CASH" ? "warning" : "neutral"}>
                        {slip.paymentMethod === "BANK" ? (
                          <Landmark className="size-2.5" />
                        ) : slip.paymentMethod === "MOMO" ? (
                          <Smartphone className="size-2.5" />
                        ) : null}
                        {slip.paymentMethod === "BANK"
                          ? "Bank"
                          : slip.paymentMethod === "MOMO"
                            ? "Mobile money"
                            : "Cash"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
