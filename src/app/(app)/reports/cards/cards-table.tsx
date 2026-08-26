"use client";

import { Printer } from "lucide-react";

import { DataTable, type Column } from "@/components/data-table";
import { Badge, Button, StatusBadge } from "@/components/ui";

export type ReportCardRow = {
  id: string;
  studentName: string;
  admissionNo: string;
  className: string;
  term: string;
  average: number | null;
  overallGrade: string | null;
  position: number | null;
  classSize: number | null;
  attendanceRate: number | null;
  status: string;
  hasRemark: boolean;
};

export function ReportCardsTable({ rows }: { rows: ReportCardRow[] }) {
  const columns: Array<Column<ReportCardRow>> = [
    {
      id: "student",
      header: "Student",
      accessor: (row) => row.studentName,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.studentName}</p>
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
    },
    {
      id: "term",
      header: "Term",
      accessor: (row) => row.term,
      filter: { type: "select" },
      priority: 2,
    },
    {
      id: "average",
      header: "Average",
      accessor: (row) => row.average ?? "",
      cell: (row) => (row.average === null ? "-" : `${row.average.toFixed(1)}%`),
      align: "right",
    },
    {
      id: "grade",
      header: "Grade",
      accessor: (row) => row.overallGrade ?? "",
      cell: (row) =>
        row.overallGrade ? <Badge tone="neutral">{row.overallGrade}</Badge> : "-",
      align: "center",
      priority: 2,
    },
    {
      id: "position",
      header: "Position",
      accessor: (row) => row.position ?? "",
      cell: (row) =>
        row.position ? (
          <span className="numeric">
            {row.position}
            <span className="text-[var(--text-subtle)]">/{row.classSize}</span>
          </span>
        ) : (
          "-"
        ),
      align: "right",
      priority: 2,
    },
    {
      id: "attendance",
      header: "Attendance",
      accessor: (row) => row.attendanceRate ?? "",
      cell: (row) =>
        row.attendanceRate === null ? "-" : `${row.attendanceRate.toFixed(0)}%`,
      align: "right",
      priority: 3,
    },
    {
      id: "remark",
      header: "Remark",
      accessor: (row) => (row.hasRemark ? "Written" : "Missing"),
      cell: (row) =>
        row.hasRemark ? (
          <Badge tone="success">Written</Badge>
        ) : (
          <Badge tone="warning">Missing</Badge>
        ),
      filter: { type: "select", label: "Teacher remark" },
      priority: 3,
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      cell: (row) => <StatusBadge status={row.status} />,
      filter: { type: "tags", label: "Status" },
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      href={(row) => `/reports/cards/${row.id}`}
      storageKey="report-cards"
      exportFileName="report-cards"
      searchPlaceholder="Search by student, class or term…"
      emptyTitle="No report cards yet"
      emptyDescription="Generate them for a class using the panel on the left."
      initialSort={{ columnId: "class", direction: "asc" }}
      bulkActions={(selected, clear) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const ids = selected.map((row) => row.id).join(",");
            window.open(`/reports/cards/print?ids=${ids}`, "_blank");
            clear();
          }}
        >
          <Printer className="size-3.5" />
          Print {selected.length} card{selected.length === 1 ? "" : "s"}
        </Button>
      )}
    />
  );
}
