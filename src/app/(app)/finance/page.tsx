import type { Metadata } from "next";
import {
  AlertTriangle,
  FilePlus2,
  FileText,
  Receipt,
  TrendingDown,
  Wallet,
} from "lucide-react";

import { AiInsightCard, type InsightView } from "@/components/ai-insight";
import { BarSeriesChart } from "@/components/charts";
import { Card, CardHeader, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { isAiEnabled } from "@/lib/ai/client";
import { getCachedInsight } from "@/lib/ai/insights";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, percentOf } from "@/lib/money";
import { formatPercent } from "@/lib/utils";

import { generateFinanceInsightAction } from "../dashboard/actions";
import { InvoicesTable, type InvoiceRow } from "./invoices-table";

export const metadata: Metadata = { title: "Fees & Billing" };
export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const user = await requirePermission("finance.read");

  const [invoices, channelTotals, cachedInsight] = await Promise.all([
    db.invoice.findMany({
      where: { status: { not: "DRAFT" } },
      orderBy: { issueDate: "desc" },
      select: {
        id: true,
        invoiceNo: true,
        status: true,
        totalMinor: true,
        paidMinor: true,
        balanceMinor: true,
        dueDate: true,
        issueDate: true,
        remindersSent: true,
        term: { select: { name: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
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
      },
    }),
    db.payment.groupBy({
      by: ["channel"],
      where: { status: "SUCCESS" },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
    getCachedInsight("FINANCE_HEALTH", null),
  ]);

  const now = Date.now();
  const rows: InvoiceRow[] = invoices.map((invoice) => {
    const enrolment = invoice.student.enrollments[0];
    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      studentId: invoice.student.id,
      studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
      admissionNo: invoice.student.admissionNo,
      className: enrolment
        ? `${enrolment.classSection.classLevel.name} ${enrolment.classSection.name}`
        : "—",
      term: invoice.term?.name ?? "—",
      status: invoice.status,
      totalMinor: invoice.totalMinor,
      paidMinor: invoice.paidMinor,
      balanceMinor: invoice.balanceMinor,
      dueDate: invoice.dueDate?.toISOString() ?? null,
      issueDate: invoice.issueDate.toISOString(),
      daysOverdue:
        invoice.dueDate && invoice.balanceMinor > 0 && invoice.dueDate.getTime() < now
          ? Math.floor((now - invoice.dueDate.getTime()) / 86_400_000)
          : null,
      remindersSent: invoice.remindersSent,
    };
  });

  const active = rows.filter(
    (row) => row.status !== "CANCELLED" && row.status !== "WRITTEN_OFF",
  );
  const billed = active.reduce((sum, row) => sum + row.totalMinor, 0);
  const collected = active.reduce((sum, row) => sum + row.paidMinor, 0);
  const outstanding = active.reduce((sum, row) => sum + row.balanceMinor, 0);
  const overdue = active.filter((row) => (row.daysOverdue ?? 0) > 0);

  const insight: InsightView | null = cachedInsight
    ? {
        title: cachedInsight.title,
        narrative: cachedInsight.narrative,
        findings: (cachedInsight.findings as InsightView["findings"]) ?? [],
        actions: (cachedInsight.actions as InsightView["actions"]) ?? [],
        createdAt: cachedInsight.createdAt,
        model: cachedInsight.model,
      }
    : null;

  const channelRows = channelTotals
    .map((row) => ({
      channel: row.channel
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase()),
      amount: Math.round((row._sum.amountMinor ?? 0) / 100),
      count: row._count._all,
    }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <>
      <PageHeader
        title="Fees & Billing"
        description="Invoices, payments and collection across the school."
        action={
          <>
            {userCan(user, "finance.invoice.create") ? (
              <LinkButton href="/finance/invoices/generate" variant="outline" size="sm">
                <FilePlus2 className="size-4" />
                Generate invoices
              </LinkButton>
            ) : null}
            {userCan(user, "finance.payment.record") ? (
              <LinkButton href="/finance/payments/new" size="sm">
                <Receipt className="size-4" />
                Record payment
              </LinkButton>
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total billed"
          value={formatMoney(billed, "GHS", { compact: true })}
          tone="info"
          icon={<FileText className="size-4" />}
        />
        <StatCard
          label="Collected"
          value={formatMoney(collected, "GHS", { compact: true })}
          tone="success"
          icon={<Wallet className="size-4" />}
          hint={formatPercent(percentOf(collected, billed))}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstanding, "GHS", { compact: true })}
          tone={outstanding > 0 ? "warning" : "success"}
          icon={<TrendingDown className="size-4" />}
        />
        <StatCard
          label="Overdue invoices"
          value={overdue.length.toLocaleString()}
          tone={overdue.length ? "danger" : "success"}
          icon={<AlertTriangle className="size-4" />}
          hint={formatMoney(
            overdue.reduce((sum, row) => sum + row.balanceMinor, 0),
            "GHS",
            { compact: true },
          )}
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <BarSeriesChart
          title="Payments by channel"
          description="How families actually pay — drives where reminders should point"
          rows={channelRows}
          categoryKey="channel"
          categoryLabel="Channel"
          horizontal
          height={Math.max(200, channelRows.length * 34)}
          series={[
            {
              key: "amount",
              label: "Value received",
              format: "money",
            },
          ]}
        />

        <Card>
          <CardHeader
            title="Collection health"
            description="Where the outstanding balance sits"
          />
          <div className="divide-y divide-[var(--border)]">
            {(
              [
                { label: "Paid in full", filter: (row: InvoiceRow) => row.status === "PAID", tone: "text-[var(--success)]" },
                { label: "Part paid", filter: (row: InvoiceRow) => row.status === "PART_PAID", tone: "text-[var(--warning)]" },
                { label: "Not yet paid", filter: (row: InvoiceRow) => row.status === "ISSUED", tone: "" },
                { label: "Overdue", filter: (row: InvoiceRow) => row.status === "OVERDUE", tone: "text-[var(--danger)]" },
              ] as const
            ).map((band) => {
              const matching = active.filter(band.filter);
              const value = matching.reduce((sum, row) => sum + row.balanceMinor, 0);
              return (
                <div
                  key={band.label}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{band.label}</p>
                    <p className="numeric text-xs text-[var(--text-subtle)]">
                      {matching.length} invoice{matching.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className={`numeric text-sm font-semibold ${band.tone}`}>
                    {formatMoney(value)}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {userCan(user, "ai.insight.view") ? (
        <div className="mb-5">
          <AiInsightCard
            insight={insight}
            enabled={isAiEnabled()}
            onGenerate={
              userCan(user, "ai.insight.generate")
                ? generateFinanceInsightAction
                : undefined
            }
            emptyHint="Claude will read the ageing profile, channel mix and concentration risk, then propose a 30-day collection plan."
          />
        </div>
      ) : null}

      <InvoicesTable rows={rows} canRemind={userCan(user, "finance.reminder.manage")} />
    </>
  );
}
