"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil, UserCheck, UserX } from "lucide-react";

import { DataTable, TagList, type Column } from "@/components/data-table";
import { Modal } from "@/components/modal";
import { RowActions, RowButton } from "@/components/row-actions";
import { Avatar, Badge } from "@/components/ui";
import { describeDeactivation } from "@/lib/guardian-contact";
import { formatMoney } from "@/lib/money";
import { cn, formatPhone, humanise } from "@/lib/utils";

import { GuardianForm, type GuardianValues } from "./guardian-form";
import { GuardianStatusCard } from "./status-card";

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
  isActive: boolean;
  deactivatedReason: string | null;
  /** Everything the edit form needs, so opening it costs no round trip. */
  values: GuardianValues;
};

export type GuardianAbilities = { manage: boolean };

export function GuardiansTable({
  rows,
  can,
  documentCategories,
}: {
  rows: GuardianRow[];
  can: GuardianAbilities;
  documentCategories: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();

  // One panel value rather than two booleans: opening the status panel while
  // the edit panel is open is not a state this screen should be able to reach.
  const [panel, setPanel] = useState<{
    row: GuardianRow;
    part: "edit" | "status";
  } | null>(null);

  const close = useCallback(() => setPanel(null), []);
  const refresh = useCallback(() => router.refresh(), [router]);

  const columns: Array<Column<GuardianRow>> = [
    {
      id: "name",
      header: "Guardian",
      accessor: (row) => row.name,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.name} src={row.photoUrl} size={32} />
          <div className="min-w-0">
            <p
              className={cn(
                "truncate font-medium",
                // Dimmed rather than struck through: they are still a real
                // person on the child's record, not a mistake.
                !row.isActive && "text-[var(--text-muted)]",
              )}
            >
              {row.name}
            </p>
            <p className="truncate text-xs text-[var(--text-subtle)]">
              {row.isActive
                ? `${row.occupation ?? "-"}${row.employer ? ` · ${row.employer}` : ""}`
                : `Not contacted: ${describeDeactivation(row.deactivatedReason).toLowerCase()}`}
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
    {
      id: "contactable",
      header: "Contact",
      accessor: (row) => (row.isActive ? "Active" : "Deactivated"),
      cell: (row) =>
        row.isActive ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge tone="neutral">Deactivated</Badge>
        ),
      // A school with a few hundred families wants to see the working list by
      // default, and reach the rest deliberately.
      filter: { type: "select", label: "Contact status" },
      priority: 2,
    },
  ];

  if (can.manage) {
    columns.push({
      id: "actions",
      header: "",
      align: "right",
      sortable: false,
      // Controls, not facts: they have no place in the search index or the
      // exported spreadsheet.
      searchable: false,
      width: "72px",
      cell: (row) => (
        <RowActions>
          <RowButton
            label={`Edit ${row.name}`}
            onClick={() => setPanel({ row, part: "edit" })}
          >
            <Pencil className="size-3.5" />
          </RowButton>

          <RowButton
            label={row.isActive ? `Deactivate ${row.name}` : `Reactivate ${row.name}`}
            tone={row.isActive ? "danger" : undefined}
            onClick={() => setPanel({ row, part: "status" })}
          >
            {row.isActive ? (
              <UserX className="size-3.5" />
            ) : (
              <UserCheck className="size-3.5" />
            )}
          </RowButton>
        </RowActions>
      ),
    });
  }

  return (
    <>
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

      {/*
        Edit opens here rather than on its own page.

        Somebody correcting a phone number has the list in front of them and
        usually has another correction to make in it. Sending them to a full
        page and back loses their search, their filters and their place in a
        table of four hundred rows. The page at /guardians/[id]/edit still
        exists and still works: it is what a bookmark and a browser tab expect.
      */}
      <Modal
        open={panel?.part === "edit"}
        onClose={close}
        title={panel ? `Edit ${panel.row.name}` : ""}
        wide
      >
        {panel?.part === "edit" ? (
          <GuardianForm
            values={panel.row.values}
            documentCategories={documentCategories}
            onSuccess={() => {
              refresh();
              close();
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={panel?.part === "status"}
        onClose={close}
        title={
          panel
            ? panel.row.isActive
              ? `Deactivate ${panel.row.name}`
              : `Reactivate ${panel.row.name}`
            : ""
        }
      >
        {panel?.part === "status" ? (
          <GuardianStatusCard
            guardianId={panel.row.id}
            name={panel.row.name}
            isActive={panel.row.isActive}
            reason={panel.row.deactivatedReason}
            onDone={() => {
              refresh();
              close();
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}
