import Link from "next/link";
import {
  Banknote,
  CalendarDays,
  Receipt,
  TrendingDown,
  UserPlus,
  Wallet,
} from "lucide-react";

import { Badge, Card, CardBody, CardHeader, LinkButton, StatCard } from "@/components/ui";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { payrollPeriodLabel } from "@/lib/payroll";
import { formatDate, relativeTime } from "@/lib/utils";

/**
 * The panels that answer "what am I responsible for" — money, payroll,
 * admissions, and what is coming up. Each is silent when its answer is
 * nothing.
 */

type Viewer = {
  id: string;
  staffId?: string | null;
  permissions: Set<string>;
};

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

// ---------------------------------------------------------------------------
// The money today
// ---------------------------------------------------------------------------

export async function MoneyTodayPanel({ viewer }: { viewer: Viewer }) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });

  // Payment records a successful receipt as SUCCESS, stamped paidAt — the
  // names the rest of finance already uses.
  const [todayTaken, weekTaken, arrears, overdue, recent] = await Promise.all([
    db.payment.aggregate({
      where: { paidAt: { gte: startOfToday() }, status: "SUCCESS" },
      _sum: { amountMinor: true },
      _count: true,
    }),
    db.payment.aggregate({
      where: { paidAt: { gte: weekAgo }, status: "SUCCESS" },
      _sum: { amountMinor: true },
    }),
    db.invoice.aggregate({
      where: {
        academicYearId: year?.id,
        status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
      },
      _sum: { balanceMinor: true },
    }),
    db.invoice.count({
      where: {
        status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
        dueDate: { lt: new Date() },
      },
    }),
    db.payment.findMany({
      where: { status: "SUCCESS" },
      orderBy: { paidAt: "desc" },
      take: 4,
      select: {
        id: true,
        amountMinor: true,
        channel: true,
        paidAt: true,
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  const canRecord = viewer.permissions.has("finance.payment.record");

  return (
    <Card>
      <CardHeader
        title="The money today"
        description={`${todayTaken._count} payment${todayTaken._count === 1 ? "" : "s"} received today`}
        action={
          canRecord ? (
            <LinkButton href="/finance/payments/new" size="sm">
              <Receipt className="size-4" />
              Record a payment
            </LinkButton>
          ) : (
            <LinkButton href="/finance" variant="outline" size="sm">
              Open finance
            </LinkButton>
          )
        }
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label="Taken today"
            value={formatMoney(todayTaken._sum.amountMinor ?? 0, "GHS", { compact: true })}
            tone="success"
            icon={<Wallet className="size-4" />}
          />
          <StatCard
            label="This week"
            value={formatMoney(weekTaken._sum.amountMinor ?? 0, "GHS", { compact: true })}
            tone="info"
          />
          <StatCard
            label="Arrears"
            value={formatMoney(arrears._sum.balanceMinor ?? 0, "GHS", { compact: true })}
            hint={`${overdue} invoice${overdue === 1 ? "" : "s"} overdue`}
            tone={overdue ? "warning" : "success"}
            icon={<TrendingDown className="size-4" />}
            href="/finance/invoices"
          />
        </div>

        {recent.length ? (
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {recent.map((payment) => (
              <li key={payment.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Link
                  href={`/students/${payment.student.id}?tab=finance`}
                  className="min-w-0 flex-1 truncate hover:text-[var(--primary)]"
                >
                  {payment.student.firstName} {payment.student.lastName}
                </Link>
                <span className="text-xs text-[var(--text-subtle)]">
                  {relativeTime(payment.paidAt)}
                </span>
                <span className="numeric font-medium">
                  {formatMoney(payment.amountMinor, "GHS")}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Payroll waiting for a decision
// ---------------------------------------------------------------------------

export async function PayrollStatusPanel({ viewer }: { viewer: Viewer }) {
  const run = await db.payrollRun.findFirst({
    where: { status: { in: ["DRAFT", "APPROVED"] } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: {
      id: true,
      year: true,
      month: true,
      status: true,
      approvedBy: true,
      payslips: { select: { netMinor: true } },
    },
  });
  if (!run) return null;

  const net = run.payslips.reduce((sum, slip) => sum + slip.netMinor, 0);
  const canApprove = viewer.permissions.has("payroll.approve");
  const waitingOnMe =
    (run.status === "DRAFT" || run.status === "APPROVED") && canApprove;

  return (
    <Card>
      <CardHeader
        title={`${payrollPeriodLabel(run.year, run.month)} payroll`}
        description={
          run.status === "DRAFT"
            ? `A draft of ${run.payslips.length} payslip${run.payslips.length === 1 ? "" : "s"} is waiting to be checked.`
            : `Approved by ${run.approvedBy ?? "—"}. Not yet marked paid.`
        }
        action={
          <LinkButton
            href={`/payroll/${run.id}`}
            variant={waitingOnMe ? "primary" : "outline"}
            size="sm"
          >
            <Banknote className="size-4" />
            {waitingOnMe
              ? run.status === "DRAFT"
                ? "Review and approve"
                : "Mark paid"
              : "Open the run"}
          </LinkButton>
        }
      />
      <CardBody className="flex items-baseline gap-3">
        <p className="numeric text-2xl font-semibold">{formatMoney(net, "GHS")}</p>
        <Badge tone={run.status === "DRAFT" ? "warning" : "info"}>
          {run.status === "DRAFT" ? "Draft" : "Approved"}
        </Badge>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The admissions pipeline
// ---------------------------------------------------------------------------

export async function AdmissionsPipelinePanel({ viewer }: { viewer: Viewer }) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [applicants, offered, enrolledThisWeek, enquiries] = await Promise.all([
    db.student.count({ where: { status: "APPLICANT" } }),
    db.student.count({ where: { status: "OFFERED" } }),
    db.student.count({
      where: { status: "ENROLLED", admissionDate: { gte: weekAgo } },
    }),
    viewer.permissions.has("student.create")
      ? db.siteFormSubmission.count({ where: { isRead: false, isSpam: false } })
      : Promise.resolve(0),
  ]);

  if (!applicants && !offered && !enrolledThisWeek && !enquiries) return null;

  return (
    <Card>
      <CardHeader
        title="Admissions"
        description="Where each applicant has got to."
        action={
          <LinkButton href="/students/new" variant="outline" size="sm">
            <UserPlus className="size-4" />
            Admit a student
          </LinkButton>
        }
      />
      <CardBody className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Applicants"
          value={applicants}
          hint={applicants ? "Awaiting a decision" : "None waiting"}
          tone={applicants ? "warning" : "neutral"}
          href="/students?status=APPLICANT"
        />
        <StatCard
          label="Offered"
          value={offered}
          hint={offered ? "Not yet enrolled" : "None outstanding"}
          tone={offered ? "info" : "neutral"}
        />
        <StatCard label="Enrolled this week" value={enrolledThisWeek} tone="success" />
        {enquiries ? (
          <StatCard
            label="Website enquiries"
            value={enquiries}
            hint="Unanswered"
            tone="warning"
            href="/website/enquiries"
          />
        ) : null}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Coming up — the calendar, for everyone
// ---------------------------------------------------------------------------

export async function ComingUpPanel() {
  const now = new Date();
  const events = await db.calendarEvent.findMany({
    where: { endsAt: { gte: now } },
    orderBy: { startsAt: "asc" },
    take: 5,
    select: {
      id: true,
      title: true,
      startsAt: true,
      isHoliday: true,
      location: true,
    },
  });
  if (!events.length) return null;

  return (
    <Card>
      <CardHeader
        title="Coming up"
        description="Next on the school calendar"
        action={
          <LinkButton href="/academics/calendar" variant="ghost" size="sm">
            <CalendarDays className="size-4" />
            Calendar
          </LinkButton>
        }
      />
      <ul className="divide-y divide-[var(--border)]">
        {events.map((event) => (
          <li key={event.id} className="flex items-center gap-2 px-5 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{event.title}</span>
            {event.isHoliday ? <Badge tone="success">Holiday</Badge> : null}
            <span className="numeric shrink-0 text-xs text-[var(--text-subtle)]">
              {formatDate(event.startsAt)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
