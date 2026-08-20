"use client";

import { Bell } from "lucide-react";

import { DataTable, type Column } from "@/components/data-table";
import { Button, StatusBadge } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

import { sendInvoiceReminderAction } from "./actions";

export type InvoiceRow = {
  id: string;
  invoiceNo: string;
  studentName: string;
  studentId: string;
  admissionNo: string;
  className: string;
  term: string;
  status: string;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  dueDate: string | null;
  issueDate: string;
  daysOverdue: number | null;
  remindersSent: number;
};

export function InvoicesTable({
  rows,
  canRemind,
}: {
  rows: InvoiceRow[];
  canRemind: boolean;
}) {
  const columns: Array<Column<InvoiceRow>> = [
    {
      id: "invoiceNo",
      header: "Invoice",
      accessor: (row) => row.invoiceNo,
      cell: (row) => <span className="numeric">{row.invoiceNo}</span>,
      width: "150px",
    },
    {
      id: "student",
      header: "Student",
      accessor: (row) => row.studentName,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.studentName}</p>
          <p className="numeric truncate text-xs text-[var(--text-subtle)]">
            {row.admissionNo}
          </p>
        </div>
      ),
    },
    {
      id: "class",
      header: "Class",
      accessor: (row) => row.className,
      filter: { type: "select", label: "Class" },
      priority: 2,
    },
    {
      id: "term",
      header: "Term",
      accessor: (row) => row.term,
      filter: { type: "select" },
      priority: 3,
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      cell: (row) => <StatusBadge status={row.status} />,
      filter: { type: "tags", label: "Payment status" },
    },
    {
      id: "total",
      header: "Total",
      accessor: (row) => row.totalMinor,
      cell: (row) => formatMoney(row.totalMinor),
      align: "right",
      priority: 2,
    },
    {
      id: "paid",
      header: "Paid",
      accessor: (row) => row.paidMinor,
      cell: (row) => (
        <span className="text-[var(--success)]">{formatMoney(row.paidMinor)}</span>
      ),
      align: "right",
      priority: 2,
    },
    {
      id: "balance",
      header: "Balance",
      accessor: (row) => row.balanceMinor,
      cell: (row) => (
        <span
          className={row.balanceMinor > 0 ? "font-medium text-[var(--danger)]" : ""}
        >
          {formatMoney(row.balanceMinor)}
        </span>
      ),
      align: "right",
    },
    {
      id: "due",
      header: "Due",
      accessor: (row) => row.dueDate ?? "",
      cell: (row) => (
        <div>
          <p>{formatDate(row.dueDate)}</p>
          {row.daysOverdue && row.daysOverdue > 0 ? (
            <p className="text-xs text-[var(--danger)]">
              {row.daysOverdue} day{row.daysOverdue === 1 ? "" : "s"} late
            </p>
          ) : null}
        </div>
      ),
      priority: 2,
    },
    {
      id: "reminders",
      header: "Reminders",
      accessor: (row) => row.remindersSent,
      align: "right",
      priority: 3,
    },
    ...(canRemind
      ? [
          {
            id: "actions",
            header: "",
            sortable: false,
            searchable: false,
            cell: (row: InvoiceRow) =>
              row.balanceMinor > 0 ? (
                <form
                  action={async () => {
                    await sendInvoiceReminderAction(row.id);
                  }}
                >
                  <Button type="submit" variant="ghost" size="sm" title="Send reminder">
                    <Bell className="size-3.5" />
                  </Button>
                </form>
              ) : null,
            width: "60px",
          } satisfies Column<InvoiceRow>,
        ]
      : []),
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      href={(row) => `/finance/invoices/${row.id}`}
      storageKey="invoices"
      exportFileName="invoices"
      partial
      emptyTitle="No invoices match"
      emptyDescription="Adjust the filters, or generate invoices for the term."
      initialSort={{ columnId: "balance", direction: "desc" }}
    />
  );
}
