import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, Clock, Power, Send } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { formatDateTime, humanise, relativeTime } from "@/lib/utils";

import { toggleReminderRuleAction } from "../actions";
import { RuleForm } from "./rule-form";

export const metadata: Metadata = { title: "Fee reminders" };
export const dynamic = "force-dynamic";

function describe(rule: {
  trigger: string;
  offsetDays: number;
  repeatEveryDays: number;
  maxReminders: number;
}): string {
  const when =
    rule.trigger === "BEFORE_DUE"
      ? `${rule.offsetDays} day${rule.offsetDays === 1 ? "" : "s"} before the due date`
      : rule.trigger === "ON_DUE"
        ? "on the due date"
        : rule.trigger === "AFTER_DUE"
          ? `${rule.offsetDays} day${rule.offsetDays === 1 ? "" : "s"} after the due date`
          : "while a balance is outstanding";

  const repeat = rule.repeatEveryDays
    ? `, repeating every ${rule.repeatEveryDays} days`
    : "";

  return `Fires ${when}${repeat}, up to ${rule.maxReminders} time${rule.maxReminders === 1 ? "" : "s"}.`;
}

export default async function RemindersPage() {
  await requirePermission("finance.reminder.manage");

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [rules, recent, sentThisMonth, chaseable] = await Promise.all([
    db.reminderRule.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      include: { _count: { select: { reminders: true } } },
    }),
    db.feeReminder.findMany({
      orderBy: { sentAt: "desc" },
      take: 25,
      include: {
        rule: { select: { name: true } },
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            student: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    db.feeReminder.count({ where: { sentAt: { gte: since } } }),
    db.invoice.aggregate({
      where: { balanceMinor: { gt: 0 }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _count: { _all: true },
      _sum: { balanceMinor: true },
    }),
  ]);

  const active = rules.filter((rule) => rule.isActive);

  return (
    <>
      <PageHeader
        title="Fee reminders"
        description="Rules that chase outstanding fees automatically, and the record of what has gone out."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Active rules"
          value={active.length}
          hint={`${rules.length - active.length} paused`}
          tone={active.length ? "success" : "warning"}
          icon={<BellRing className="size-4" />}
        />
        <StatCard
          label="Sent in 30 days"
          value={sentThisMonth.toLocaleString()}
          tone="info"
          icon={<Send className="size-4" />}
        />
        <StatCard
          label="Invoices in arrears"
          value={(chaseable._count._all ?? 0).toLocaleString()}
          tone={chaseable._count._all ? "warning" : "success"}
        />
        <StatCard
          label="Value being chased"
          value={formatMoney(chaseable._sum.balanceMinor ?? 0)}
          tone="violet"
        />
      </div>

      {!env.cronSecret ? (
        <Alert tone="warning" className="mb-4">
          CRON_SECRET is not set, so the scheduled job that fires these rules cannot
          authenticate. Rules will not run until it is configured and a scheduler
          calls <code className="font-mono text-xs">/api/cron/reminders</code>.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {rules.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BellRing className="size-5" />}
                title="No reminder rules"
                description="Create one on the right. Nothing is sent automatically until a rule exists."
              />
            </Card>
          ) : null}

          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardHeader
                title={rule.name}
                description={describe(rule)}
                action={
                  <>
                    <Badge tone={rule.isActive ? "success" : "neutral"}>
                      {rule.isActive ? "Active" : "Paused"}
                    </Badge>
                    <form action={toggleReminderRuleAction}>
                      <input type="hidden" name="id" value={rule.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        <Power className="size-3.5" />
                        {rule.isActive ? "Pause" : "Resume"}
                      </Button>
                    </form>
                  </>
                }
              />
              <CardBody className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="text-[var(--text-muted)]">Channels:</span>
                  {rule.channels.map((channel) => (
                    <Badge key={channel} tone="info">
                      {humanise(channel)}
                    </Badge>
                  ))}
                </span>
                <span>
                  <span className="text-[var(--text-muted)]">Audience:</span>{" "}
                  {humanise(rule.audience)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {rule.sendAfterHour}:00-{rule.sendBeforeHour}:00
                </span>
                {rule.minBalanceMinor > 0 ? (
                  <span>
                    <span className="text-[var(--text-muted)]">Only above</span>{" "}
                    {formatMoney(rule.minBalanceMinor)}
                  </span>
                ) : null}
                <span className="text-[var(--text-subtle)]">
                  {rule._count.reminders} sent
                  {rule.lastRunAt ? ` · last ran ${relativeTime(rule.lastRunAt)}` : ""}
                </span>
              </CardBody>
            </Card>
          ))}

          <Card>
            <CardHeader
              title="Recently sent"
              description="Every reminder is recorded against the invoice with the balance at the time."
            />
            {recent.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {recent.map((reminder) => (
                  <li
                    key={reminder.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/finance/invoices/${reminder.invoice.id}`}
                        className="text-sm hover:text-[var(--primary)]"
                      >
                        {reminder.invoice.student.firstName}{" "}
                        {reminder.invoice.student.lastName}
                        <span className="numeric ml-1.5 text-xs text-[var(--text-subtle)]">
                          {reminder.invoice.invoiceNo}
                        </span>
                      </Link>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {reminder.rule?.name ?? humanise(reminder.kind)} · balance was{" "}
                        {formatMoney(reminder.balanceAtSendMinor)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--text-subtle)]">
                      {formatDateTime(reminder.sentAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing sent yet" />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="New rule" />
            <RuleForm />
          </Card>

          <Card>
            <CardBody className="text-xs text-[var(--text-muted)]">
              <p className="mb-1.5 font-medium text-[var(--text)]">
                Why the quiet hours matter
              </p>
              <p>
                A fee reminder at 11pm reads as harassment, and the school wears the
                complaint, not the software. The window is enforced when the job runs:
                a rule that comes due outside it waits rather than sending.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
