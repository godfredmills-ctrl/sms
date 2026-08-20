import type { Metadata } from "next";
import { AlertTriangle, FileText, Receipt, Wallet } from "lucide-react";

import { Alert, Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { LedgerSearch } from "@/components/ledger-search";
import { Pager, pageOf } from "@/components/pager";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, percentOf } from "@/lib/money";

import { InvoicesTable, type InvoiceRow } from "../invoices-table";
import { GenerateForm } from "./generate-form";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

const PER_PAGE = 50;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("finance.read");
  const canGenerate = userCan(user, "finance.invoice.create");

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);

  // Searched in the database, because the table below holds one page. A
  // bursar looking for a parent's bill was told "no invoices match" while
  // the three they wanted sat on server page 12.
  const query = String(params.q ?? "").trim();
  const where = query
    ? {
        OR: [
          { invoiceNo: { contains: query, mode: "insensitive" as const } },
          { student: { firstName: { contains: query, mode: "insensitive" as const } } },
          { student: { lastName: { contains: query, mode: "insensitive" as const } } },
          { student: { admissionNo: { contains: query, mode: "insensitive" as const } } },
        ],
      }
    : {};

  // 3000 was one term's billing for a school this size, so the cap was reached
  // in the first year and everything before it fell off the end.
  const [invoices, total, years] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: { issueDate: "desc" },
      skip,
      take,
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
    db.invoice.count({ where }),
    db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        isCurrent: true,
        terms: {
          orderBy: { sequence: "asc" },
          select: { id: true, name: true, isCurrent: true },
        },
      },
    }),
  ]);

  const now = Date.now();

  const rows: InvoiceRow[] = invoices.map((invoice) => {
    const section = invoice.student.enrollments[0]?.classSection;
    const overdue =
      invoice.dueDate && invoice.balanceMinor > 0
        ? Math.floor((now - invoice.dueDate.getTime()) / DAY)
        : null;

    return {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      studentId: invoice.student.id,
      studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
      admissionNo: invoice.student.admissionNo,
      className: section
        ? `${section.classLevel.name} ${section.name}`
        : "Unassigned",
      term: invoice.term?.name ?? "—",
      status: invoice.status,
      totalMinor: invoice.totalMinor,
      paidMinor: invoice.paidMinor,
      balanceMinor: invoice.balanceMinor,
      dueDate: invoice.dueDate?.toISOString() ?? null,
      issueDate: invoice.issueDate.toISOString(),
      daysOverdue: overdue !== null && overdue > 0 ? overdue : null,
      remindersSent: invoice.remindersSent,
    };
  });

  const live = rows.filter((row) => !["DRAFT", "CANCELLED"].includes(row.status));
  const billed = live.reduce((sum, row) => sum + row.totalMinor, 0);
  const collected = live.reduce((sum, row) => sum + row.paidMinor, 0);
  const outstanding = live.reduce((sum, row) => sum + row.balanceMinor, 0);
  const overdue = live.filter((row) => (row.daysOverdue ?? 0) > 0);
  const overdueValue = overdue.reduce((sum, row) => sum + row.balanceMinor, 0);
  const drafts = rows.filter((row) => row.status === "DRAFT").length;

  const yearOptions = years.map((year) => ({
    value: year.id,
    label: year.name,
    description: year.isCurrent ? "Current year" : undefined,
  }));

  const termOptions = years.flatMap((year) =>
    year.terms.map((term) => ({
      value: term.id,
      label: term.name,
      description: term.isCurrent ? "Current term" : undefined,
      group: year.name,
    })),
  );

  // Current year and term first, so the common case needs no selection.
  yearOptions.sort((a, b) => Number(Boolean(b.description)) - Number(Boolean(a.description)));
  termOptions.sort((a, b) => Number(Boolean(b.description)) - Number(Boolean(a.description)));

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Every bill raised, what has been paid against it, and what is still owed."
        action={<RefreshButton />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Billed"
          value={formatMoney(billed)}
          hint={`${live.length} live invoices`}
          tone="violet"
          icon={<FileText className="size-4" />}
        />
        <StatCard
          label="Collected"
          value={formatMoney(collected)}
          hint={`${percentOf(collected, billed).toFixed(0)}% of billed`}
          tone="success"
          icon={<Receipt className="size-4" />}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstanding)}
          tone={outstanding > 0 ? "warning" : "success"}
          icon={<Wallet className="size-4" />}
        />
        <StatCard
          label="Overdue"
          value={formatMoney(overdueValue)}
          hint={`${overdue.length} invoices past due`}
          tone={overdue.length ? "danger" : "success"}
          icon={<AlertTriangle className="size-4" />}
        />
      </div>

      {drafts > 0 ? (
        <Alert tone="info" className="mb-4">
          {drafts} invoice{drafts === 1 ? " is" : "s are"} still a draft. Drafts are
          excluded from every total above and no reminder will go out for them until
          they are issued.
        </Alert>
      ) : null}

      <div className={canGenerate ? "grid gap-4 xl:grid-cols-[1fr_340px]" : ""}>
        <div>
          <LedgerSearch
            action="/finance/invoices"
            defaultValue={query}
            placeholder="Invoice number, pupil name or admission number…"
            label="Search every invoice"
            found={total}
            noun="invoice"
          />
          <InvoicesTable
            rows={rows}
            canRemind={userCan(user, "finance.reminder.manage")}
          />
          <Pager
            basePath="/finance/invoices"
            searchParams={params}
            page={page}
            perPage={PER_PAGE}
            total={total}
            label="invoices"
          />
        </div>

        {canGenerate ? (
          <div>
            <Card>
              <CardHeader
                title="Bulk billing"
                description="Bills every enrolled student from the published fee structure that matches their level, boarding status and fee band."
              />
              <GenerateForm years={yearOptions} terms={termOptions} />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
