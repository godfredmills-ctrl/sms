"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { DataTable, TagList, type Column } from "@/components/data-table";
import { Avatar, Badge } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatPhone, humanise } from "@/lib/utils";

export type GuardianRow = {
  id: string;
  name: string;
  photoUrl: string | null;
  phone: string;
  altPhone: string | null;
  email: string | null;
  occupation: string | null;
  employer: string | null;
  preferredChannel: string;
  city: string | null;
  isPtaMember: boolean;
  isAlumni: boolean;
  hasAccount: boolean;
  childCount: number;
  children: string[];
  childIds: string[];
  relations: string[];
  isBillPayer: boolean;
  isEmergency: boolean;
  outstandingMinor: number;
};

export function GuardiansTable({ rows }: { rows: GuardianRow[] }) {
  const columns: Array<Column<GuardianRow>> = [
    {
      id: "name",
      header: "Guardian",
      accessor: (row) => row.name,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.name} src={row.photoUrl} size={32} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.name}</p>
            <p className="truncate text-xs text-[var(--text-subtle)]">
              {row.occupation ?? "-"}
              {row.employer ? ` · ${row.employer}` : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "children",
      header: "Children",
      accessor: (row) => row.children.join(", "),
      cell: (row) => (
        <div className="min-w-0">
          {row.children.slice(0, 2).map((child, index) => (
            <Link
              key={row.childIds[index]}
              href={`/students/${row.childIds[index]}`}
              className="block truncate text-xs hover:text-[var(--primary)]"
            >
              {child}
            </Link>
          ))}
          {row.childCount > 2 ? (
            <span className="text-xs text-[var(--text-subtle)]">
              +{row.childCount - 2} more
            </span>
          ) : null}
        </div>
      ),
      sortable: false,
    },
    {
      id: "relation",
      header: "Relation",
      accessor: (row) => row.relations.join(", "),
      cell: (row) => <TagList tags={row.relations.map(humanise)} tone="violet" />,
      filter: { type: "tags", label: "Relation" },
      sortable: false,
      priority: 2,
    },
    {
      id: "phone",
      header: "Contact",
      accessor: (row) => `${row.phone} ${row.email ?? ""}`,
      cell: (row) => (
        <div className="min-w-0">
          <a
            href={`tel:${row.phone}`}
            className="numeric block truncate text-xs hover:text-[var(--primary)]"
          >
            {formatPhone(row.phone)}
          </a>
          <p className="truncate text-xs text-[var(--text-subtle)]">
            {row.email ?? "-"}
          </p>
        </div>
      ),
    },
    {
      id: "channel",
      header: "Prefers",
      accessor: (row) => row.preferredChannel,
      cell: (row) => <Badge tone="info">{humanise(row.preferredChannel)}</Badge>,
      filter: { type: "select", label: "Preferred channel" },
      priority: 2,
    },
    {
      id: "roles",
      header: "Responsibilities",
      accessor: (row) =>
        [
          row.isBillPayer ? "Bill payer" : "",
          row.isEmergency ? "Emergency" : "",
          row.isPtaMember ? "PTA" : "",
          row.isAlumni ? "Alumni" : "",
        ]
          .filter(Boolean)
          .join(", "),
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.isBillPayer ? <Badge tone="warning">Bill payer</Badge> : null}
          {row.isEmergency ? <Badge tone="danger">Emergency</Badge> : null}
          {row.isPtaMember ? <Badge tone="teal">PTA</Badge> : null}
          {row.isAlumni ? <Badge tone="violet">Alumni</Badge> : null}
        </div>
      ),
      filter: { type: "tags", label: "Responsibility" },
      sortable: false,
      priority: 2,
    },
    {
      id: "outstanding",
      header: "Outstanding",
      accessor: (row) => row.outstandingMinor,
      cell: (row) =>
        row.outstandingMinor > 0 ? (
          <span className="numeric font-medium text-[var(--danger)]">
            {formatMoney(row.outstandingMinor)}
          </span>
        ) : (
          <span className="text-[var(--text-subtle)]">-</span>
        ),
      align: "right",
    },
    {
      id: "account",
      header: "Portal",
      accessor: (row) => (row.hasAccount ? "Yes" : "No"),
      cell: (row) =>
        row.hasAccount ? (
          <Badge tone="success">Has login</Badge>
        ) : (
          <Badge tone="neutral">
            <AlertTriangle className="size-2.5" />
            No login
          </Badge>
        ),
      filter: { type: "select", label: "Portal access" },
      priority: 3,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      href={(row) => `/guardians/${row.id}`}
      storageKey="guardians"
      exportFileName="guardians"
      searchPlaceholder="Search by guardian, child, phone or employer…"
      emptyTitle="No guardians"
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}
