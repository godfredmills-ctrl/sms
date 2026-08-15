"use client";

import { DataTable, TagList, type Column } from "@/components/data-table";
import { Avatar, Badge, StatusBadge } from "@/components/ui";
import { formatDate, formatPhone, humanise } from "@/lib/utils";

export type StaffRow = {
  id: string;
  staffNo: string;
  name: string;
  photoUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  employmentType: string;
  status: string;
  gender: string;
  email: string | null;
  phone: string | null;
  campus: string | null;
  isTeaching: boolean;
  specialisations: string[];
  classesTaught: number;
  formClass: string | null;
  hireDate: string | null;
  yearsOfService: number | null;
  hasAccount: boolean;
};

export function StaffTable({ rows }: { rows: StaffRow[] }) {
  const columns: Array<Column<StaffRow>> = [
    {
      id: "name",
      header: "Staff member",
      accessor: (row) => row.name,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.name} src={row.photoUrl} size={32} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.name}</p>
            <p className="truncate text-xs text-[var(--text-subtle)]">
              {row.staffNo}
              {row.jobTitle ? ` · ${row.jobTitle}` : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "department",
      header: "Department",
      accessor: (row) => row.department ?? "Unassigned",
      filter: { type: "select", label: "Department" },
    },
    {
      id: "role",
      header: "Role",
      accessor: (row) => (row.isTeaching ? "Teaching" : "Non-teaching"),
      cell: (row) => (
        <Badge tone={row.isTeaching ? "info" : "neutral"}>
          {row.isTeaching ? "Teaching" : "Non-teaching"}
        </Badge>
      ),
      filter: { type: "select", label: "Role" },
      priority: 2,
    },
    {
      id: "employmentType",
      header: "Contract",
      accessor: (row) => row.employmentType,
      cell: (row) => humanise(row.employmentType),
      filter: { type: "select", label: "Contract" },
      priority: 3,
    },
    {
      id: "specialisations",
      header: "Teaches",
      accessor: (row) => row.specialisations.join(", "),
      cell: (row) => <TagList tags={row.specialisations} tone="violet" />,
      filter: { type: "tags", label: "Subject" },
      sortable: false,
      priority: 2,
    },
    {
      id: "load",
      header: "Classes",
      accessor: (row) => row.classesTaught,
      cell: (row) => (
        <span className="numeric">
          {row.classesTaught}
          {row.formClass ? (
            <span className="ml-1.5 text-xs text-[var(--text-subtle)]">
              form: {row.formClass}
            </span>
          ) : null}
        </span>
      ),
      align: "right",
      priority: 2,
    },
    {
      id: "phone",
      header: "Contact",
      accessor: (row) => `${row.phone ?? ""} ${row.email ?? ""}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="numeric truncate text-xs">{formatPhone(row.phone)}</p>
          <p className="truncate text-xs text-[var(--text-subtle)]">
            {row.email ?? "—"}
          </p>
        </div>
      ),
      priority: 3,
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={row.status} />
          {!row.hasAccount ? (
            <Badge tone="warning" title="Cannot sign in">
              No login
            </Badge>
          ) : null}
        </div>
      ),
      filter: { type: "select", label: "Status" },
    },
    {
      id: "hireDate",
      header: "Joined",
      accessor: (row) => row.hireDate ?? "",
      cell: (row) =>
        row.hireDate ? (
          <span className="whitespace-nowrap">
            {formatDate(row.hireDate)}
            {row.yearsOfService !== null ? (
              <span className="ml-1.5 text-xs text-[var(--text-subtle)]">
                {row.yearsOfService}y
              </span>
            ) : null}
          </span>
        ) : (
          "—"
        ),
      priority: 3,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      href={(row) => `/staff/${row.id}`}
      storageKey="staff"
      exportFileName="staff"
      searchPlaceholder="Search by name, staff number, department or subject…"
      emptyTitle="No staff records"
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}
