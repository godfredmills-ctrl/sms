"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, IdCard, Pencil, UserX } from "lucide-react";

import { DataTable, TagList, type Column } from "@/components/data-table";
import { Modal } from "@/components/modal";
import { RowActions, RowButton, RowLink } from "@/components/row-actions";
import { Avatar, Badge, StatusBadge } from "@/components/ui";
import { formatDate, formatPhone, humanise } from "@/lib/utils";

import { StaffEditPanel } from "./edit-panel";
import { StaffStatusCard } from "./profile-cards";

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
  /** Carried so the status panel opens with what is already on the record. */
  exitDate: string;
  exitReason: string;
};

export type StaffAbilities = { status: boolean; edit: boolean };

export function StaffTable({ rows, can }: { rows: StaffRow[]; can: StaffAbilities }) {
  const [panel, setPanel] = useState<{ row: StaffRow; part: "edit" | "status" } | null>(
    null,
  );

  const router = useRouter();
  const close = useCallback(() => setPanel(null), []);
  const saved = useCallback(() => {
    router.refresh();
    setPanel(null);
  }, [router]);

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
            {row.email ?? "-"}
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
          "-"
        ),
      priority: 3,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      sortable: false,
      searchable: false,
      width: "104px",
      cell: (row) => (
        <RowActions>
          {/* Opens over the list. The page at /staff/[id]/edit still works. */}
          {can.edit ? (
            <RowButton
              label={`Edit ${row.name}`}
              onClick={() => setPanel({ row, part: "edit" })}
            >
              <Pencil className="size-3.5" />
            </RowButton>
          ) : null}

          {/* A card asserts current employment, and the route prints active
              staff only, so it is not offered for anybody who has left. */}
          {row.status === "ACTIVE" ? (
            <RowLink
              href={`/api/id-cards?kind=staff&staffId=${row.id}`}
              label={`Print an ID card for ${row.name}`}
              newTab
            >
              <IdCard className="size-3.5" />
            </RowLink>
          ) : null}

          {/* The deactivating control, opening the employment status panel.
              Resigned, terminated and retired are three different endings with
              three different last days, so the panel asks rather than a bare
              button choosing one. */}
          {can.status ? (
            <RowButton
              label={
                row.status === "ACTIVE"
                  ? `Deactivate ${row.name}`
                  : `Employment status of ${row.name}`
              }
              tone={row.status === "ACTIVE" ? "danger" : undefined}
              onClick={() => setPanel({ row, part: "status" })}
            >
              {row.status === "ACTIVE" ? (
                <UserX className="size-3.5" />
              ) : (
                <BadgeCheck className="size-3.5" />
              )}
            </RowButton>
          ) : null}
        </RowActions>
      ),
    },
  ];

  return (
    <>
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

    <Modal
      open={panel?.part === "edit"}
      onClose={close}
      title={panel ? `Edit ${panel.row.name}` : ""}
      wide
    >
      {panel?.part === "edit" ? (
        <StaffEditPanel staffId={panel.row.id} onSaved={saved} />
      ) : null}
    </Modal>

    <Modal
      open={panel?.part === "status"}
      onClose={close}
      title={
        panel
          ? panel.row.status === "ACTIVE"
            ? `Deactivate ${panel.row.name}`
            : `${panel.row.name}: employment status`
          : ""
      }
    >
      {panel?.part === "status" ? (
        // The same card the staff member's own page uses. Recording that
        // somebody has left ends their access, and a second copy of that form
        // would be a second place for it to go wrong.
        <StaffStatusCard
          staffId={panel.row.id}
          status={panel.row.status}
          exitDate={panel.row.exitDate}
          exitReason={panel.row.exitReason}
        />
      ) : null}
    </Modal>
    </>
  );
}
