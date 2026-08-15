"use client";

import { Mail, MessageSquare, Printer } from "lucide-react";

import { DataTable, type Column } from "@/components/data-table";
import { Avatar, Badge, Button, StatusBadge } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { calculateAge, formatDate, formatPhone } from "@/lib/utils";

export type StudentRow = {
  id: string;
  admissionNo: string;
  fullName: string;
  photoUrl: string | null;
  gender: string;
  dateOfBirth: string | null;
  status: string;
  className: string;
  classLevel: string;
  house: string | null;
  boarding: string;
  nationality: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  outstandingMinor: number;
  attendanceRate: number | null;
  averageScore: number | null;
  admissionDate: string | null;
  learningSupport: string[];
};

export function StudentsTable({ rows }: { rows: StudentRow[] }) {
  const columns: Array<Column<StudentRow>> = [
    {
      id: "name",
      header: "Student",
      accessor: (row) => row.fullName,
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.fullName} src={row.photoUrl} size={30} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.fullName}</p>
            <p className="numeric truncate text-xs text-[var(--text-subtle)]">
              {row.admissionNo}
            </p>
          </div>
        </div>
      ),
      width: "220px",
    },
    {
      id: "class",
      header: "Class",
      accessor: (row) => row.className,
      filter: { type: "select", label: "Class" },
    },
    {
      id: "level",
      header: "Level",
      accessor: (row) => row.classLevel,
      filter: { type: "select", label: "Class level" },
      priority: 3,
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      cell: (row) => <StatusBadge status={row.status} />,
      filter: { type: "tags", label: "Enrolment status" },
    },
    {
      id: "gender",
      header: "Gender",
      accessor: (row) => row.gender,
      filter: { type: "select" },
      priority: 3,
    },
    {
      id: "age",
      header: "Age",
      accessor: (row) => calculateAge(row.dateOfBirth) ?? "",
      align: "right",
      priority: 3,
    },
    {
      id: "boarding",
      header: "Boarding",
      accessor: (row) => row.boarding,
      filter: { type: "select", label: "Day / Boarder" },
      priority: 2,
    },
    {
      id: "house",
      header: "House",
      accessor: (row) => row.house ?? "",
      filter: { type: "select" },
      priority: 3,
    },
    {
      id: "support",
      header: "Learning support",
      accessor: (row) => row.learningSupport.join(", "),
      cell: (row) =>
        row.learningSupport.length ? (
          <div className="flex flex-wrap gap-1">
            {row.learningSupport.map((entry) => (
              <Badge key={entry} tone="info">
                {entry}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-[var(--text-subtle)]">—</span>
        ),
      priority: 3,
      sortable: false,
    },
    {
      id: "guardian",
      header: "Primary guardian",
      accessor: (row) => row.guardianName ?? "",
      cell: (row) =>
        row.guardianName ? (
          <div className="min-w-0">
            <p className="truncate">{row.guardianName}</p>
            <p className="numeric truncate text-xs text-[var(--text-subtle)]">
              {formatPhone(row.guardianPhone)}
            </p>
          </div>
        ) : (
          <span className="text-[var(--text-subtle)]">Not linked</span>
        ),
      priority: 2,
    },
    {
      id: "attendance",
      header: "Attendance",
      accessor: (row) => row.attendanceRate ?? "",
      cell: (row) =>
        row.attendanceRate === null ? (
          <span className="text-[var(--text-subtle)]">—</span>
        ) : (
          <span
            className={
              row.attendanceRate < 85
                ? "font-medium text-[var(--danger)]"
                : row.attendanceRate < 92
                  ? "text-[var(--warning)]"
                  : ""
            }
          >
            {row.attendanceRate.toFixed(1)}%
          </span>
        ),
      align: "right",
      priority: 2,
    },
    {
      id: "average",
      header: "Average",
      accessor: (row) => row.averageScore ?? "",
      cell: (row) =>
        row.averageScore === null ? (
          <span className="text-[var(--text-subtle)]">—</span>
        ) : (
          `${row.averageScore.toFixed(1)}%`
        ),
      align: "right",
      priority: 2,
    },
    {
      id: "balance",
      header: "Balance",
      accessor: (row) => row.outstandingMinor,
      cell: (row) =>
        row.outstandingMinor > 0 ? (
          <span className="font-medium text-[var(--danger)]">
            {formatMoney(row.outstandingMinor)}
          </span>
        ) : (
          <span className="text-[var(--success)]">Clear</span>
        ),
      align: "right",
      priority: 2,
    },
    {
      id: "admitted",
      header: "Admitted",
      accessor: (row) => row.admissionDate ?? "",
      cell: (row) => formatDate(row.admissionDate),
      priority: 3,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      href={(row) => `/students/${row.id}`}
      storageKey="students"
      exportFileName="students"
      searchPlaceholder="Search by name, admission number, class, guardian…"
      emptyTitle="No students match"
      emptyDescription="Adjust your search or filters, or admit a new student."
      initialSort={{ columnId: "name", direction: "asc" }}
      bulkActions={(selected, clear) => (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const ids = selected.map((row) => row.id).join(",");
              window.location.href = `/communications/compose?students=${ids}&channel=SMS`;
            }}
          >
            <MessageSquare className="size-3.5" />
            SMS guardians
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const ids = selected.map((row) => row.id).join(",");
              window.location.href = `/communications/compose?students=${ids}&channel=EMAIL`;
            }}
          >
            <Mail className="size-3.5" />
            Email
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const ids = selected.map((row) => row.id).join(",");
              window.open(`/print/id-cards?students=${ids}`, "_blank");
              clear();
            }}
          >
            <Printer className="size-3.5" />
            Print ID cards
          </Button>
        </>
      )}
    />
  );
}
