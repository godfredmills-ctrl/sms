"use client";

import Link from "next/link";

import { DataTable, type Column } from "@/components/data-table";
import { Badge } from "@/components/ui";
import { EXPENSE_STATUSES } from "@/lib/expense-labels";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export type ExpenseRow = {
  id: string;
  reference: string;
  description: string;
  category: string;
  vendor: string | null;
  amountMinor: number;
  taxMinor: number;
  status: string;
  incurredOn: string;
  paidOn: string | null;
  method: string | null;
  requestedBy: string | null;
};

const TONE = new Map(EXPENSE_STATUSES.map((entry) => [entry.value, entry] as const));

export function ExpensesTable({ rows }: { rows: ExpenseRow[] }) {
  const columns: Array<Column<ExpenseRow>> = [
    {
      id: "reference",
      header: "Reference",
      accessor: (row) => row.reference,
      cell: (row) => (
        <Link
          href={`/finance/expenses/${row.id}`}
          className="numeric text-[var(--primary)] hover:underline"
        >
          {row.reference}
        </Link>
      ),
      width: "150px",
    },
    {
      id: "description",
      header: "What for",
      accessor: (row) => `${row.description} ${row.vendor ?? ""}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.description}</p>
          <p className="truncate text-xs text-[var(--text-subtle)]">
            {row.vendor ?? "No vendor recorded"}
          </p>
        </div>
      ),
    },
    {
      id: "category",
      header: "Category",
      accessor: (row) => row.category,
      filter: { type: "select", label: "Category" },
      priority: 2,
    },
    {
      id: "amount",
      header: "Amount",
      accessor: (row) => row.amountMinor,
      cell: (row) => (
        <div className="text-right">
          <p className="numeric">{formatMoney(row.amountMinor)}</p>
          {row.taxMinor ? (
            <p className="numeric text-xs text-[var(--text-subtle)]">
              incl. {formatMoney(row.taxMinor)} tax
            </p>
          ) : null}
        </div>
      ),
      align: "right",
      width: "150px",
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      cell: (row) => {
        const entry = TONE.get(row.status as (typeof EXPENSE_STATUSES)[number]["value"]);
        return <Badge tone={entry?.tone ?? "neutral"}>{entry?.label ?? row.status}</Badge>;
      },
      filter: {
        type: "select",
        label: "Status",
        options: EXPENSE_STATUSES.map((entry) => ({
          value: entry.value,
          label: entry.label,
          tone: entry.tone,
        })),
      },
      width: "160px",
    },
    {
      id: "incurredOn",
      header: "Incurred",
      accessor: (row) => row.incurredOn,
      cell: (row) => <span className="numeric">{formatDate(row.incurredOn)}</span>,
      width: "120px",
      priority: 2,
    },
    {
      id: "paidOn",
      header: "Paid",
      accessor: (row) => row.paidOn ?? "",
      cell: (row) =>
        row.paidOn ? (
          <div>
            <p className="numeric">{formatDate(row.paidOn)}</p>
            <p className="text-xs text-[var(--text-subtle)]">
              {row.method?.toLowerCase().replace(/_/g, " ") ?? ""}
            </p>
          </div>
        ) : (
          <span className="text-[var(--text-subtle)]">-</span>
        ),
      width: "130px",
      priority: 3,
    },
    {
      id: "requestedBy",
      header: "Recorded by",
      accessor: (row) => row.requestedBy ?? "",
      priority: 3,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      href={(row) => `/finance/expenses/${row.id}`}
      partial
      searchPlaceholder="Reference, description or vendor…"
      emptyTitle="No expenditure recorded"
      emptyDescription="Bills recorded here are what the income and expenditure statement is made of."
      exportFileName="expenditure"
      storageKey="finance-expenses"
    />
  );
}
