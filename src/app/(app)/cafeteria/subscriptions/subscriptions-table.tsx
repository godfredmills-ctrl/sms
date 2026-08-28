"use client";

import { DataTable, type Column } from "@/components/data-table";
import { Avatar, Badge } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDate, humanise } from "@/lib/utils";

import { StatusButton } from "./subscription-forms";

export type SubscriptionRow = {
  id: string;
  studentId: string;
  name: string;
  admissionNo: string;
  photoUrl: string | null;
  className: string;
  planName: string;
  priceMinor: number;
  status: string;
  startsOn: string;
  endsOn: string | null;
  charged: boolean;
  chargedMinor: number | null;
  reason: string | null;
};

export function SubscriptionsTable({
  rows,
  canManage,
}: {
  rows: SubscriptionRow[];
  canManage: boolean;
}) {
  const columns: Array<Column<SubscriptionRow>> = [
    {
      id: "name",
      header: "Pupil",
      accessor: (row) => `${row.name} ${row.admissionNo}`,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.name} src={row.photoUrl} size={30} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.name}</p>
            <p className="numeric truncate text-xs text-[var(--text-subtle)]">
              {row.admissionNo}
              {row.className ? ` · ${row.className}` : ""}
            </p>
          </div>
        </div>
      ),
      width: "240px",
    },
    {
      id: "plan",
      header: "Plan",
      accessor: (row) => row.planName,
      filter: { type: "select", label: "Plan" },
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => humanise(row.status),
      cell: (row) => (
        <div className="min-w-0">
          <Badge
            tone={
              row.status === "ACTIVE"
                ? "success"
                : row.status === "SUSPENDED"
                  ? "warning"
                  : "neutral"
            }
          >
            {humanise(row.status)}
          </Badge>
          {row.reason ? (
            <p className="truncate text-xs text-[var(--text-subtle)]">{row.reason}</p>
          ) : null}
        </div>
      ),
      filter: { type: "select", label: "Status" },
    },
    {
      id: "dates",
      header: "Running",
      accessor: (row) => row.startsOn,
      cell: (row) => (
        <span className="text-xs text-[var(--text-muted)]">
          {formatDate(row.startsOn)}
          {row.endsOn ? ` to ${formatDate(row.endsOn)}` : ""}
        </span>
      ),
      priority: 2,
    },
    {
      id: "charged",
      header: "Charged",
      accessor: (row) => (row.charged ? "Yes" : "No"),
      cell: (row) =>
        row.charged ? (
          <span className="numeric text-sm">{formatMoney(row.chargedMinor ?? 0)}</span>
        ) : (
          <Badge tone="warning">Not yet</Badge>
        ),
      filter: { type: "select", label: "Charged" },
      align: "right",
    },
  ];

  if (canManage) {
    columns.push({
      id: "actions",
      header: "",
      align: "right",
      sortable: false,
      searchable: false,
      width: "96px",
      cell: (row) => <StatusButton id={row.id} name={row.name} status={row.status} />,
    });
  }

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      href={(row) => `/students/${row.studentId}`}
      storageKey="meal-subscriptions"
      exportFileName="meal-subscriptions"
      searchPlaceholder="Search by pupil, admission number or plan…"
      emptyTitle="Nobody is on a meal plan this term"
      emptyDescription="Put a pupil on one, or check whether any plans are on sale."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}
