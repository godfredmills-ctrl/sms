import type { Metadata } from "next";
import { Banknote, Download, Receipt } from "lucide-react";

import {
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { parseAllowances, payrollPeriodLabel } from "@/lib/payroll";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "My payslips" };
export const dynamic = "force-dynamic";

/**
 * A staff member's own payslips.
 *
 * No payroll permission: this is the viewer's own pay, scoped by the
 * session's staffId, and it shows nobody else's. Only slips from a PAID run
 * appear — a draft is the bursar's working, and a member of staff seeing a
 * figure that later changes is worse than seeing nothing.
 *
 * Each slip downloads as a PDF: the document a bank, a landlord or an
 * embassy asks for, which a figure on a screen cannot be.
 */
export default async function MyPayslipsPage() {
  const user = await requireUser();

  if (!user.staffId) {
    return (
      <>
        <PageHeader title="My payslips" />
        <Card>
          <EmptyState
            icon={<Receipt className="size-5" />}
            title="No staff record linked"
            description="Your account is not linked to a staff record, so there are no payslips to show."
          />
        </Card>
      </>
    );
  }

  const payslips = await db.payslip.findMany({
    where: { staffId: user.staffId, run: { status: "PAID" } },
    orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }],
    take: 24,
    select: {
      id: true,
      basicMinor: true,
      allowances: true,
      grossMinor: true,
      ssnitEmployeeMinor: true,
      ssnitEmployerMinor: true,
      payeMinor: true,
      netMinor: true,
      paymentMethod: true,
      run: { select: { year: true, month: true, paidAt: true } },
    },
  });

  const latest = payslips[0];
  const yearToDate = payslips
    .filter((slip) => slip.run.year === new Date().getFullYear())
    .reduce(
      (sums, slip) => ({
        gross: sums.gross + slip.grossMinor,
        net: sums.net + slip.netMinor,
        tax: sums.tax + slip.payeMinor,
        ssnit: sums.ssnit + slip.ssnitEmployeeMinor,
      }),
      { gross: 0, net: 0, tax: 0, ssnit: 0 },
    );

  return (
    <>
      <PageHeader
        title="My payslips"
        description="Your pay, month by month — what was earned, deducted and received."
      />

      {payslips.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Banknote className="size-5" />}
            title="No payslips yet"
            description="Payslips appear here once a month's payroll has been paid."
          />
        </Card>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Last payslip"
              value={formatMoney(latest.netMinor, "GHS")}
              hint={payrollPeriodLabel(latest.run.year, latest.run.month)}
              tone="success"
              icon={<Banknote className="size-4" />}
            />
            <StatCard
              label="Gross this year"
              value={formatMoney(yearToDate.gross, "GHS", { compact: true })}
              tone="violet"
            />
            <StatCard
              label="PAYE this year"
              value={formatMoney(yearToDate.tax, "GHS", { compact: true })}
              tone="warning"
            />
            <StatCard
              label="SSNIT this year"
              value={formatMoney(yearToDate.ssnit, "GHS", { compact: true })}
              hint="Your 5.5%"
              tone="info"
            />
          </div>

          <div className="space-y-3">
            {payslips.map((slip) => {
              const allowances = parseAllowances(slip.allowances);
              return (
                <Card key={slip.id}>
                  <CardHeader
                    title={payrollPeriodLabel(slip.run.year, slip.run.month)}
                    description={
                      slip.run.paidAt ? `Paid ${formatDate(slip.run.paidAt, "long")}` : undefined
                    }
                    action={
                      <>
                        <span className="numeric text-base font-semibold">
                          {formatMoney(slip.netMinor, "GHS")}
                        </span>
                        <LinkButton
                          href={`/api/payslips?id=${slip.id}`}
                          target="_blank"
                          variant="outline"
                          size="sm"
                        >
                          <Download className="size-4" />
                          Payslip
                        </LinkButton>
                      </>
                    }
                  />
                  <CardBody>
                    <DescriptionList
                      columns={2}
                      items={[
                        { label: "Basic salary", value: formatMoney(slip.basicMinor, "GHS") },
                        ...allowances.map((entry) => ({
                          label: entry.name,
                          value: formatMoney(entry.amountMinor, "GHS"),
                        })),
                        { label: "Gross pay", value: formatMoney(slip.grossMinor, "GHS") },
                        {
                          label: "SSNIT (5.5%)",
                          value: `− ${formatMoney(slip.ssnitEmployeeMinor, "GHS")}`,
                        },
                        { label: "PAYE", value: `− ${formatMoney(slip.payeMinor, "GHS")}` },
                        { label: "Net pay", value: formatMoney(slip.netMinor, "GHS") },
                        {
                          label: "Paid by",
                          value:
                            slip.paymentMethod === "BANK"
                              ? "Bank transfer"
                              : slip.paymentMethod === "MOMO"
                                ? "Mobile money"
                                : "Cash",
                        },
                        {
                          label: "Employer SSNIT (13%)",
                          value: `${formatMoney(slip.ssnitEmployerMinor, "GHS")} — paid by the school on your behalf`,
                        },
                      ]}
                    />
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
