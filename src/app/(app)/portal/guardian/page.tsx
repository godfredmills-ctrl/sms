import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck,
  FileText,
  GraduationCap,
  Megaphone,
  Receipt,
  Wallet,
} from "lucide-react";

import {
  Alert,
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  ProgressBar,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStudentStatement } from "@/lib/finance";
import { formatMoney, percentOf } from "@/lib/money";
import { formatDate, formatPercent, relativeTime, toNumber } from "@/lib/utils";
import { isLiveGateway, onlineChannels } from "@/lib/payments";

import { PayForm, type PayableChild } from "./pay-form";

export const metadata: Metadata = { title: "Parent Portal" };
export const dynamic = "force-dynamic";

export default async function GuardianPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const user = await requireUser();
  const { ref } = await searchParams;

  if (!user.guardianId) {
    return (
      <>
        <PageHeader title="Parent Portal" />
        <Alert tone="warning" title="Account not linked">
          Your login is not yet linked to a guardian record. Please contact the school
          office so they can connect your account to your children.
        </Alert>
      </>
    );
  }

  const links = await db.studentGuardian.findMany({
    where: { guardianId: user.guardianId },
    orderBy: { sortKey: "asc" },
    select: {
      isBillPayer: true,
      relation: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
          photoUrl: true,
          status: true,
          enrollments: {
            where: { status: "ACTIVE" },
            take: 1,
            select: {
              classSection: {
                select: { name: true, classLevel: { select: { name: true } } },
              },
            },
          },
          attendance: { select: { status: true } },
          reportCards: {
            where: { status: "PUBLISHED" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              averageScore: true,
              positionInClass: true,
              classSize: true,
              overallGrade: true,
              term: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!links.length) {
    return (
      <>
        <PageHeader title={`Welcome, ${user.firstName}`} />
        <Alert tone="info" title="No children linked yet">
          The school has not yet linked any students to your account.
        </Alert>
      </>
    );
  }

  const statements = await Promise.all(
    links.map((link) => getStudentStatement(link.student.id)),
  );

  const announcements = await db.announcement.findMany({
    where: {
      status: "PUBLISHED",
      audiences: { has: "GUARDIAN" },
    },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    take: 4,
    select: {
      id: true,
      title: true,
      summary: true,
      priority: true,
      isPinned: true,
      publishedAt: true,
    },
  });

  const pendingPayment = ref
    ? await db.payment.findUnique({
        where: { reference: ref },
        select: { status: true, amountMinor: true, receiptNo: true },
      })
    : null;

  const totalOutstanding = statements.reduce(
    (sum, statement) => sum + statement.balanceMinor,
    0,
  );
  const totalBilled = statements.reduce(
    (sum, statement) => sum + statement.billedMinor,
    0,
  );
  const totalPaid = statements.reduce((sum, statement) => sum + statement.paidMinor, 0);

  const payableChildren: PayableChild[] = links.map((link, index) => {
    const enrolment = link.student.enrollments[0];
    return {
      id: link.student.id,
      name: `${link.student.firstName} ${link.student.lastName}`,
      className: enrolment
        ? `${enrolment.classSection.classLevel.name} ${enrolment.classSection.name}`
        : "Unassigned",
      outstandingMinor: statements[index].balanceMinor,
    };
  });

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description={`You have ${links.length} child${links.length === 1 ? "" : "ren"} at the school.`}
      />

      {pendingPayment ? (
        <Alert
          tone={pendingPayment.status === "SUCCESS" ? "success" : "info"}
          title={
            pendingPayment.status === "SUCCESS"
              ? "Payment received"
              : "Payment is being confirmed"
          }
          className="mb-5"
        >
          {pendingPayment.status === "SUCCESS"
            ? `We have received ${formatMoney(pendingPayment.amountMinor)}. Receipt ${pendingPayment.receiptNo}.`
            : `Your payment of ${formatMoney(pendingPayment.amountMinor)} is being confirmed with the provider. This page will show the receipt once it clears.`}
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total billed"
          value={formatMoney(totalBilled, "GHS", { compact: true })}
          tone="info"
          icon={<FileText className="size-4" />}
        />
        <StatCard
          label="Paid to date"
          value={formatMoney(totalPaid, "GHS", { compact: true })}
          tone="success"
          icon={<Receipt className="size-4" />}
          hint={formatPercent(percentOf(totalPaid, totalBilled))}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(totalOutstanding, "GHS", { compact: true })}
          tone={totalOutstanding > 0 ? "warning" : "success"}
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Children"
          value={links.length}
          tone="violet"
          icon={<GraduationCap className="size-4" />}
          hint={links.map((link) => link.student.firstName).join(", ")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Children ------------------------------------------------------- */}
        <div className="space-y-4 lg:col-span-2">
          {links.map((link, index) => {
            const student = link.student;
            const statement = statements[index];
            const enrolment = student.enrollments[0];
            const report = student.reportCards[0];

            const total = student.attendance.length;
            const present = student.attendance.filter((record) =>
              ["PRESENT", "LATE", "EXCUSED", "HALF_DAY"].includes(record.status),
            ).length;
            const attendanceRate = percentOf(present, total);

            return (
              <Card key={student.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2.5">
                      <Avatar
                        name={`${student.firstName} ${student.lastName}`}
                        src={student.photoUrl}
                        size={32}
                      />
                      {student.firstName} {student.lastName}
                    </span>
                  }
                  description={`${
                    enrolment
                      ? `${enrolment.classSection.classLevel.name} ${enrolment.classSection.name}`
                      : "Not enrolled"
                  } · ${student.admissionNo}`}
                  action={<StatusBadge status={student.status} />}
                />
                <CardBody className="grid gap-5 sm:grid-cols-3">
                  <div>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-xs text-[var(--text-muted)]">
                        <CalendarCheck className="mr-1 inline size-3" />
                        Attendance
                      </span>
                      <span className="numeric text-sm font-semibold">
                        {total ? formatPercent(attendanceRate) : "-"}
                      </span>
                    </div>
                    <ProgressBar
                      value={attendanceRate}
                      tone={
                        attendanceRate >= 92
                          ? "success"
                          : attendanceRate >= 85
                            ? "warning"
                            : "danger"
                      }
                      label="Attendance"
                    />
                    <p className="numeric mt-1 text-xs text-[var(--text-subtle)]">
                      {present} of {total} sessions
                    </p>
                  </div>

                  <div>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-xs text-[var(--text-muted)]">
                        <Wallet className="mr-1 inline size-3" />
                        Fees
                      </span>
                      <span className="numeric text-sm font-semibold">
                        {formatPercent(
                          percentOf(statement.paidMinor, statement.billedMinor),
                        )}
                      </span>
                    </div>
                    <ProgressBar
                      value={percentOf(statement.paidMinor, statement.billedMinor)}
                      tone={statement.balanceMinor > 0 ? "warning" : "success"}
                      label="Fees paid"
                    />
                    <p className="numeric mt-1 text-xs text-[var(--text-subtle)]">
                      {statement.balanceMinor > 0
                        ? `${formatMoney(statement.balanceMinor)} outstanding`
                        : "Fully paid"}
                    </p>
                  </div>

                  <div>
                    <span className="text-xs text-[var(--text-muted)]">
                      <FileText className="mr-1 inline size-3" />
                      Latest report
                    </span>
                    {report ? (
                      <>
                        <p className="numeric mt-1 text-lg font-semibold">
                          {toNumber(report.averageScore)?.toFixed(1) ?? "-"}%
                        </p>
                        <p className="text-xs text-[var(--text-subtle)]">
                          {report.term.name}
                          {report.positionInClass
                            ? ` · position ${report.positionInClass} of ${report.classSize}`
                            : ""}
                        </p>
                        <Link
                          href={`/reports/cards/${report.id}`}
                          className="mt-1 inline-block text-xs text-[var(--primary)] hover:underline"
                        >
                          View report card →
                        </Link>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        No published results yet.
                      </p>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}

          <Card>
            <CardHeader
              title="School announcements"
              action={
                <LinkButton
                  href="/portal/guardian/announcements"
                  variant="ghost"
                  size="sm"
                >
                  View all
                </LinkButton>
              }
            />
            {announcements.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {announcements.map((announcement) => (
                  <li key={announcement.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{announcement.title}</p>
                      {announcement.isPinned ? (
                        <Badge tone="primary">Pinned</Badge>
                      ) : null}
                      {announcement.priority === "URGENT" ? (
                        <Badge tone="danger">Urgent</Badge>
                      ) : null}
                    </div>
                    {announcement.summary ? (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {announcement.summary}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-[var(--text-subtle)]">
                      {relativeTime(announcement.publishedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Megaphone className="size-5" />}
                title="No announcements"
              />
            )}
          </Card>
        </div>

        {/* Payment -------------------------------------------------------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Pay school fees"
              description="Mobile money, card, bank transfer or USSD"
            />
            <CardBody>
              {totalOutstanding > 0 ? (
                <PayForm
                  wards={payableChildren}
                  availableChannels={await onlineChannels()}
                  liveGateway={await isLiveGateway()}
                />
              ) : (
                <EmptyState
                  icon={<Wallet className="size-5" />}
                  title="All fees are paid"
                  description="Thank you. There is nothing outstanding on your account."
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent invoices" />
            <ul className="divide-y divide-[var(--border)]">
              {statements
                .flatMap((statement) => statement.invoices)
                .slice(0, 5)
                .map((invoice) => (
                  <li key={invoice.id} className="px-5 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="numeric text-sm">{invoice.invoiceNo}</span>
                      <StatusBadge status={invoice.status} />
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <span className="text-xs text-[var(--text-subtle)]">
                        Due {formatDate(invoice.dueDate)}
                      </span>
                      <span className="numeric text-sm font-medium">
                        {formatMoney(invoice.balanceMinor)}
                      </span>
                    </div>
                  </li>
                ))}
              {statements.every((statement) => !statement.invoices.length) ? (
                <li className="px-5 py-6 text-center text-sm text-[var(--text-muted)]">
                  No invoices yet.
                </li>
              ) : null}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
