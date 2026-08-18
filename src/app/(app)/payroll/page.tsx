import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, CalendarRange, Users, Wallet } from "lucide-react";

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { Pager, pageOf } from "@/components/pager";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { payrollPeriodLabel } from "@/lib/payroll";
import { formatDate } from "@/lib/utils";

import { NewRunForm } from "./new-run-form";

export const metadata: Metadata = { title: "Payroll" };
export const dynamic = "force-dynamic";

const PER_PAGE = 12;

const STATUS_TONES: Record<string, "warning" | "info" | "success" | "neutral"> = {
  DRAFT: "warning",
  APPROVED: "info",
  PAID: "success",
};

/**
 * Payroll, month by month.
 *
 * The system has always known what a school earns; this is where it learns
 * what the school pays. A run is opened as a draft, checked, approved by
 * someone other than whoever prepared it, and marked paid — and the
 * payslips freeze their numbers at the moment they were computed, so a
 * salary rise in September never rewrites what August said.
 */
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("payroll.read");
  const canManage = userCan(user, "payroll.manage");

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);

  const [runs, total, onPayroll, monthlyBill, lastPaidRun] = await Promise.all([
    db.payrollRun.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      skip,
      take,
      select: {
        id: true,
        year: true,
        month: true,
        status: true,
        approvedBy: true,
        approvedAt: true,
        paidAt: true,
        _count: { select: { payslips: true } },
        payslips: { select: { netMinor: true, grossMinor: true } },
      },
    }),
    db.payrollRun.count(),
    db.staff.count({ where: { status: "ACTIVE", basicSalaryMinor: { not: null } } }),
    db.staff.aggregate({
      where: { status: "ACTIVE", basicSalaryMinor: { not: null } },
      _sum: { basicSalaryMinor: true },
    }),
    // The whole history, not the page on screen: the other three figures on
    // this row are table-wide, and a KPI that quietly means "of the twelve
    // runs you happen to be looking at" disagrees with the ones beside it.
    db.payrollRun.findFirst({
      where: { status: "PAID" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: {
        year: true,
        month: true,
        payslips: { select: { netMinor: true } },
      },
    }),
  ]);

  const lastPaid = lastPaidRun;
  const lastPaidTotal = lastPaid
    ? lastPaid.payslips.reduce((sum, slip) => sum + slip.netMinor, 0)
    : 0;

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Monthly runs, payslips, SSNIT and PAYE — prepared, approved, then paid."
        action={
          <>
            <LinkButton href="/payroll/salaries" variant="outline" size="sm">
              <Users className="size-4" />
              Salaries
            </LinkButton>
            <RefreshButton />
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="On the payroll"
          value={onPayroll}
          hint="Active staff with a salary"
          tone="violet"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Monthly basic bill"
          value={formatMoney(monthlyBill._sum.basicSalaryMinor ?? 0, "GHS", { compact: true })}
          hint="Before allowances and deductions"
          tone="info"
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Last paid"
          value={lastPaid ? payrollPeriodLabel(lastPaid.year, lastPaid.month) : "—"}
          hint={lastPaid ? formatMoney(lastPaidTotal, "GHS", { compact: true }) : "No run paid yet"}
          tone={lastPaid ? "success" : "neutral"}
          icon={<Banknote className="size-4" />}
        />
        <StatCard label="Runs recorded" value={total} tone="neutral" />
      </div>

      <div className={canManage ? "grid gap-4 lg:grid-cols-[1fr_320px]" : ""}>
        <div className="space-y-3">
          {runs.length === 0 ? (
            <Card>
              <EmptyState
                icon={<CalendarRange className="size-5" />}
                title="No payroll runs yet"
                description={
                  canManage
                    ? "Open the first month alongside — everyone with a salary gets a payslip."
                    : "Nothing has been prepared yet."
                }
              />
            </Card>
          ) : (
            <Card>
              <CardHeader title="Runs" description="Newest first." />
              <ul className="divide-y divide-[var(--border)]">
                {runs.map((run) => {
                  const net = run.payslips.reduce((sum, slip) => sum + slip.netMinor, 0);
                  const gross = run.payslips.reduce((sum, slip) => sum + slip.grossMinor, 0);
                  return (
                    <li key={run.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                      <Link
                        href={`/payroll/${run.id}`}
                        className="text-sm font-medium hover:text-[var(--primary)]"
                      >
                        {payrollPeriodLabel(run.year, run.month)}
                      </Link>
                      <Badge tone={STATUS_TONES[run.status] ?? "neutral"}>
                        {run.status === "DRAFT"
                          ? "Draft"
                          : run.status === "APPROVED"
                            ? "Approved"
                            : "Paid"}
                      </Badge>
                      <span className="text-xs text-[var(--text-subtle)]">
                        {run._count.payslips} payslip
                        {run._count.payslips === 1 ? "" : "s"}
                      </span>
                      <span className="flex-1" />
                      <span className="numeric text-xs text-[var(--text-muted)]">
                        {formatMoney(gross, "GHS")} gross
                      </span>
                      <span className="numeric text-sm font-semibold">
                        {formatMoney(net, "GHS")}
                      </span>
                      {run.paidAt ? (
                        <span className="w-full text-xs text-[var(--text-subtle)] sm:w-auto">
                          Paid {formatDate(run.paidAt)}
                        </span>
                      ) : run.approvedAt ? (
                        <span className="w-full text-xs text-[var(--text-subtle)] sm:w-auto">
                          Approved by {run.approvedBy} · {formatDate(run.approvedAt)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Pager
            basePath="/payroll"
            searchParams={params}
            page={page}
            perPage={PER_PAGE}
            total={total}
            label="runs"
          />
        </div>

        {canManage ? (
          <div>
            <Card className="lg:sticky lg:top-20">
              <CardHeader
                title="Open a month"
                description="Everyone with a salary gets a payslip, computed from the current figures."
              />
              <NewRunForm />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
