"use client";

import { DataTable, type Column } from "@/components/data-table";
import { Badge, StatusBadge } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDate, humanise } from "@/lib/utils";

export type PaymentRow = {
  id: string;
  receiptNo: string;
  reference: string;
  studentName: string;
  admissionNo: string;
  className: string;
  amountMinor: number;
  feeMinor: number;
  allocatedMinor: number;
  unallocatedMinor: number;
  channel: string;
  provider: string;
  status: string;
  payerName: string | null;
  paidAt: string;
  receivedBy: string | null;
};

export function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  const columns: Array<Column<PaymentRow>> = [
    {
      id: "receiptNo",
      header: "Receipt",
      accessor: (row) => row.receiptNo,
      cell: (row) => <span className="numeric">{row.receiptNo}</span>,
      width: "140px",
    },
    {
      id: "student",
      header: "Student",
      accessor: (row) => `${row.studentName} ${row.admissionNo}`,
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
      priority: 3,
    },
    {
      id: "amount",
      header: "Amount",
      accessor: (row) => row.amountMinor,
      cell: (row) => (
        <span className="numeric font-medium">{formatMoney(row.amountMinor)}</span>
      ),
      align: "right",
    },
    {
      id: "unallocated",
      header: "On account",
      accessor: (row) => row.unallocatedMinor,
      cell: (row) =>
        row.unallocatedMinor > 0 ? (
          <span
            className="numeric text-[var(--warning)]"
            title="Received but not yet applied to an invoice"
          >
            {formatMoney(row.unallocatedMinor)}
          </span>
        ) : (
          <span className="text-[var(--text-subtle)]">—</span>
        ),
      align: "right",
      priority: 2,
    },
    {
      id: "channel",
      header: "Channel",
      accessor: (row) => row.channel,
      cell: (row) => <Badge tone="info">{humanise(row.channel)}</Badge>,
      filter: { type: "tags", label: "Channel" },
    },
    {
      id: "provider",
      header: "Provider",
      accessor: (row) => row.provider,
      cell: (row) => humanise(row.provider),
      filter: { type: "select", label: "Provider" },
      priority: 3,
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      cell: (row) => <StatusBadge status={row.status} />,
      filter: { type: "select", label: "Status" },
      priority: 2,
    },
    {
      id: "payer",
      header: "Paid by",
      accessor: (row) => row.payerName ?? "",
      priority: 3,
    },
    {
      id: "paidAt",
      header: "Date",
      accessor: (row) => row.paidAt,
      cell: (row) => formatDate(row.paidAt),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      href={(row) => `/finance/payments/${row.id}`}
      storageKey="payments"
      exportFileName="payments"
      partial
      emptyTitle="No payments"
      initialSort={{ columnId: "paidAt", direction: "desc" }}
    />
  );
}
