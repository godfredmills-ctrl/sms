"use client";

import { CheckCircle2, CircleSlash } from "lucide-react";

import { DataTable, type Column } from "@/components/data-table";
import { Avatar, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

export type AlumnusRow = {
  id: string;
  name: string;
  nameAtSchool: string | null;
  photoUrl: string | null;
  cohort: string;
  graduationYear: number;
  finalClass: string | null;
  email: string | null;
  phone: string | null;
  whereabouts: string;
  location: string;
  reachable: boolean;
  reachReason: string;
  deceased: boolean;
  engagementScore: number;
  engagementCount: number;
};

export function AlumniTable({
  rows,
  canContact,
}: {
  rows: AlumnusRow[];
  canContact: boolean;
}) {
  const columns: Array<Column<AlumnusRow>> = [
    {
      id: "name",
      header: "Name",
      accessor: (row) => `${row.name} ${row.nameAtSchool ?? ""}`,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.name} src={row.photoUrl} size={32} />
          <div className="min-w-0">
            <p className={cn("truncate font-medium", row.deceased && "text-[var(--text-muted)]")}>
              {row.name}
            </p>
            {/* The name they were known by at school, when it differs. A
                register that cannot connect the two cannot find anybody in
                its own photographs. */}
            <p className="truncate text-xs text-[var(--text-subtle)]">
              {row.nameAtSchool ? `At school: ${row.nameAtSchool}` : (row.finalClass ?? "-")}
            </p>
          </div>
        </div>
      ),
      width: "230px",
    },
    {
      id: "cohort",
      header: "Left",
      accessor: (row) => row.graduationYear,
      cell: (row) => <Badge tone="violet">{row.graduationYear}</Badge>,
      filter: { type: "select", label: "Cohort" },
    },
    {
      id: "whereabouts",
      header: "Now",
      accessor: (row) => `${row.whereabouts} ${row.location}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{row.whereabouts || "-"}</p>
          <p className="truncate text-xs text-[var(--text-subtle)]">{row.location || "-"}</p>
        </div>
      ),
      sortable: false,
    },
    {
      id: "reach",
      header: "Contact",
      accessor: (row) => (row.reachable ? "Reachable" : row.reachReason),
      cell: (row) => (
        <div className="min-w-0">
          {row.reachable ? (
            <Badge tone="success">
              <CheckCircle2 className="size-2.5" />
              Reachable
            </Badge>
          ) : (
            <Badge tone={row.deceased ? "neutral" : "warning"}>
              <CircleSlash className="size-2.5" />
              {row.deceased ? "Deceased" : "Not reachable"}
            </Badge>
          )}
          {!row.reachable && !row.deceased ? (
            <p className="truncate text-xs text-[var(--text-subtle)]">{row.reachReason}</p>
          ) : null}
        </div>
      ),
      filter: { type: "select", label: "Contact status" },
    },
    {
      id: "engagement",
      header: "Involved",
      accessor: (row) => row.engagementScore,
      cell: (row) =>
        row.engagementCount ? (
          <span className="numeric text-sm">
            {row.engagementScore.toFixed(1)}
            <span className="ml-1 text-xs text-[var(--text-subtle)]">
              ({row.engagementCount})
            </span>
          </span>
        ) : (
          <span className="text-[var(--text-subtle)]">-</span>
        ),
      align: "right",
      priority: 2,
    },
  ];

  if (canContact) {
    columns.push({
      id: "email",
      header: "Email",
      accessor: (row) => row.email ?? "",
      cell: (row) =>
        row.email ? (
          <a
            href={`mailto:${row.email}`}
            className="truncate text-xs hover:text-[var(--primary)]"
            onClick={(event) => event.stopPropagation()}
          >
            {row.email}
          </a>
        ) : (
          <span className="text-[var(--text-subtle)]">-</span>
        ),
      sortable: false,
      priority: 3,
    });
  }

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      href={(row) => `/alumni/${row.id}`}
      storageKey="alumni"
      exportFileName="alumni"
      searchPlaceholder="Search by name, cohort, employer or university…"
      emptyTitle="Nobody on the register yet"
      emptyDescription="Bring this year's graduates forward, or add somebody who left before the school had a system."
      initialSort={{ columnId: "cohort", direction: "desc" }}
    />
  );
}
