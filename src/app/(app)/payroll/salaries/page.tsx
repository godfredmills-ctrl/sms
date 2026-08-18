import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Landmark, Smartphone, Users, Wallet } from "lucide-react";

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { computePayslip, parseAllowances } from "@/lib/payroll";
import { listName } from "@/lib/utils";

import { SalaryForm } from "./salary-form";

export const metadata: Metadata = { title: "Salaries" };
export const dynamic = "force-dynamic";

/**
 * What each member of staff is paid, and what that costs.
 *
 * The figures here are what the NEXT run will compute — the preview column
 * shows exactly what a payslip would say today, so a salary is set with its
 * consequences visible rather than discovered on payday.
 */
export default async function SalariesPage() {
  const user = await requirePermission("payroll.read");
  const canManage = userCan(user, "payroll.manage");
  const canOpenStaff = userCan(user, "staff.read");

  const staff = await db.staff.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      staffNo: true,
      firstName: true,
      lastName: true,
      otherNames: true,
      jobTitle: true,
      basicSalaryMinor: true,
      salaryAllowances: true,
      bankAccountNo: true,
      momoNumber: true,
    },
  });

  const paid = staff.filter((member) => member.basicSalaryMinor !== null);
  const unpaid = staff.filter((member) => member.basicSalaryMinor === null);
  const noPaymentDetails = paid.filter(
    (member) => !member.bankAccountNo && !member.momoNumber,
  );

  const monthly = paid.reduce((sums, member) => {
    const figures = computePayslip({
      basicMinor: member.basicSalaryMinor ?? 0,
      allowances: parseAllowances(member.salaryAllowances),
    });
    return {
      gross: sums.gross + figures.grossMinor,
      net: sums.net + figures.netMinor,
      cost: sums.cost + figures.grossMinor + figures.ssnitEmployerMinor,
    };
  }, { gross: 0, net: 0, cost: 0 });

  return (
    <>
      <PageHeader
        title="Salaries"
        description="What each member of staff is paid, and what the next run will compute."
        action={
          <>
            <LinkButton href="/payroll" variant="outline" size="sm">
              Payroll runs
            </LinkButton>
            <RefreshButton />
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="On the payroll"
          value={paid.length}
          hint={`${unpaid.length} without a salary`}
          tone="violet"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Monthly gross"
          value={formatMoney(monthly.gross, "GHS", { compact: true })}
          tone="info"
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Monthly net"
          value={formatMoney(monthly.net, "GHS", { compact: true })}
          hint="After SSNIT and PAYE"
          tone="success"
        />
        <StatCard
          label="No payment details"
          value={noPaymentDetails.length}
          hint={noPaymentDetails.length ? "Would be paid in cash" : "All set"}
          tone={noPaymentDetails.length ? "warning" : "success"}
          icon={<AlertTriangle className="size-4" />}
        />
      </div>

      <div className={canManage ? "grid gap-4 lg:grid-cols-[1fr_340px]" : ""}>
        <Card>
          <CardHeader
            title="Staff"
            description="The preview is what a payslip would say today."
          />
          {staff.length === 0 ? (
            <EmptyState title="No active staff" description="Add staff records first." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                    <th className="px-5 py-2 font-medium">Staff</th>
                    <th className="px-3 py-2 text-right font-medium">Basic</th>
                    <th className="px-3 py-2 text-right font-medium">Allowances</th>
                    <th className="px-3 py-2 text-right font-medium">Net (preview)</th>
                    <th className="px-5 py-2 font-medium">Paid by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {staff.map((member) => {
                    const allowances = parseAllowances(member.salaryAllowances);
                    const allowanceTotal = allowances.reduce(
                      (sum, entry) => sum + entry.amountMinor,
                      0,
                    );
                    const figures =
                      member.basicSalaryMinor !== null
                        ? computePayslip({
                            basicMinor: member.basicSalaryMinor,
                            allowances,
                          })
                        : null;

                    return (
                      <tr key={member.id}>
                        <td className="px-5 py-2.5">
                          {canOpenStaff ? (
                            <Link
                              href={`/staff/${member.id}`}
                              className="font-medium hover:text-[var(--primary)]"
                            >
                              {listName(member)}
                            </Link>
                          ) : (
                            <span className="font-medium">{listName(member)}</span>
                          )}
                          <span className="ml-2 text-xs text-[var(--text-subtle)]">
                            {member.jobTitle ?? member.staffNo}
                          </span>
                        </td>
                        <td className="numeric px-3 py-2.5 text-right">
                          {member.basicSalaryMinor !== null ? (
                            formatMoney(member.basicSalaryMinor, "GHS")
                          ) : (
                            <span className="text-[var(--text-subtle)]">Not on payroll</span>
                          )}
                        </td>
                        <td
                          className="numeric px-3 py-2.5 text-right text-[var(--text-muted)]"
                          title={allowances.map((entry) => entry.name).join(", ") || undefined}
                        >
                          {allowanceTotal ? formatMoney(allowanceTotal, "GHS") : "—"}
                        </td>
                        <td className="numeric px-3 py-2.5 text-right font-semibold">
                          {figures ? formatMoney(figures.netMinor, "GHS") : "—"}
                        </td>
                        <td className="px-5 py-2.5">
                          {member.bankAccountNo ? (
                            <Badge tone="neutral">
                              <Landmark className="size-2.5" />
                              Bank
                            </Badge>
                          ) : member.momoNumber ? (
                            <Badge tone="neutral">
                              <Smartphone className="size-2.5" />
                              Mobile money
                            </Badge>
                          ) : member.basicSalaryMinor !== null ? (
                            <Badge tone="warning">Cash</Badge>
                          ) : (
                            <span className="text-xs text-[var(--text-subtle)]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {canManage ? (
          <div>
            <Card className="lg:sticky lg:top-20">
              <CardHeader
                title="Set compensation"
                description="Applies to the next run — payslips already issued keep their figures."
              />
              <SalaryForm
                staff={staff.map((member) => ({
                  value: member.id,
                  label: listName(member),
                  // The search box offers "name or staff number", and the
                  // select filters on label + description — so the number has
                  // to be in the description, not swapped out for a job title.
                  description: [member.staffNo, member.jobTitle]
                    .filter(Boolean)
                    .join(" · "),
                }))}
                current={Object.fromEntries(
                  staff.map((member) => [
                    member.id,
                    {
                      basic:
                        member.basicSalaryMinor !== null
                          ? (member.basicSalaryMinor / 100).toFixed(2)
                          : "",
                      allowances: parseAllowances(member.salaryAllowances).map((entry) => ({
                        name: entry.name,
                        amount: (entry.amountMinor / 100).toFixed(2),
                      })),
                    },
                  ]),
                )}
              />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
