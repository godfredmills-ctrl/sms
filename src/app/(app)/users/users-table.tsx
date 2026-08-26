"use client";

import { useActionState, useState } from "react";
import { KeyRound, ShieldCheck, UserCog, X } from "lucide-react";

import { DataTable, TagList, type Column } from "@/components/data-table";
import { SearchableSelect, type SelectOption } from "@/components/select-search";
import { Alert, Avatar, Badge, Button, StatusBadge } from "@/components/ui";
import { formatDate, relativeTime } from "@/lib/utils";

import { RevokeSessions } from "./revoke-sessions";

import {
  resetPasswordAction,
  setUserRolesAction,
  setUserStatusAction,
  type UserState,
} from "./actions";

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  portal: string;
  status: string;
  roleNames: string[];
  roleIds: string[];
  lastLoginAt: string | null;
  createdAt: string;
  activeSessions: number;
  mustChangePassword: boolean;
};

export function UsersTable({
  rows,
  roles,
  canManage,
  canManageRoles,
  currentUserId,
}: {
  rows: UserRow[];
  roles: SelectOption[];
  canManage: boolean;
  canManageRoles: boolean;
  currentUserId: string;
}) {
  const [editing, setEditing] = useState<UserRow | null>(null);

  const columns: Array<Column<UserRow>> = [
    {
      id: "name",
      header: "User",
      accessor: (row) => row.name,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.name} src={row.avatarUrl} size={32} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.name}</p>
            <p className="truncate text-xs text-[var(--text-subtle)]">
              {row.email ?? row.phone ?? "No contact"}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "roles",
      header: "Roles",
      accessor: (row) => row.roleNames.join(", "),
      cell: (row) => <TagList tags={row.roleNames} tone="violet" />,
      filter: { type: "tags", label: "Role" },
      sortable: false,
    },
    {
      id: "portal",
      header: "Portal",
      accessor: (row) => row.portal,
      cell: (row) => <Badge tone="info">{row.portal}</Badge>,
      filter: { type: "select", label: "Portal" },
      priority: 2,
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={row.status} />
          {row.mustChangePassword ? (
            <Badge tone="warning" title="Must set a new password at next sign-in">
              Temp password
            </Badge>
          ) : null}
        </div>
      ),
      filter: { type: "select", label: "Status" },
    },
    {
      id: "lastLoginAt",
      header: "Last seen",
      accessor: (row) => row.lastLoginAt ?? "",
      cell: (row) =>
        row.lastLoginAt ? (
          <span title={formatDate(row.lastLoginAt)}>{relativeTime(row.lastLoginAt)}</span>
        ) : (
          <span className="text-[var(--text-subtle)]">Never</span>
        ),
      priority: 2,
    },
    {
      id: "sessions",
      header: "Sessions",
      accessor: (row) => row.activeSessions,
      // The number was the whole of it — a count of live sessions with
      // nothing to do about them. The control sits in the cell because that
      // is where the number someone reacted to is.
      cell: (row) =>
        row.activeSessions ? (
          <span className="inline-flex items-center justify-end gap-2">
            <span className="numeric">{row.activeSessions}</span>
            {canManage ? (
              <RevokeSessions
                userId={row.id}
                name={row.name.split(" ")[0]}
                count={row.activeSessions}
              />
            ) : null}
          </span>
        ) : (
          <span className="text-[var(--text-subtle)]">0</span>
        ),
      align: "right",
      priority: 3,
    },
    {
      id: "createdAt",
      header: "Created",
      accessor: (row) => row.createdAt,
      cell: (row) => formatDate(row.createdAt),
      priority: 3,
    },
  ];

  if (canManage || canManageRoles) {
    columns.push({
      id: "actions",
      header: "",
      sortable: false,
      searchable: false,
      width: "56px",
      cell: (row) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            title="Manage account"
            onClick={() => setEditing(row)}
          >
            <UserCog className="size-3.5" />
          </Button>
        </div>
      ),
    });
  }

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        storageKey="users"
        exportFileName="users"
        searchPlaceholder="Search by name, email, phone or role…"
        emptyTitle="No accounts"
        initialSort={{ columnId: "name", direction: "asc" }}
      />

      {editing ? (
        <ManagePanel
          user={editing}
          roles={roles}
          canManage={canManage}
          canManageRoles={canManageRoles}
          isSelf={editing.id === currentUserId}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function ManagePanel({
  user,
  roles,
  canManage,
  canManageRoles,
  isSelf,
  onClose,
}: {
  user: UserRow;
  roles: SelectOption[];
  canManage: boolean;
  canManageRoles: boolean;
  isSelf: boolean;
  onClose: () => void;
}) {
  const [reset, resetAction] = useActionState<UserState, FormData>(
    resetPasswordAction,
    {},
  );

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/50">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-[var(--bg)] shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={user.name} src={user.avatarUrl} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-[var(--text-subtle)]">
                {user.email ?? user.phone ?? "No contact"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="space-y-5 p-5">
          {canManageRoles ? (
            <form action={setUserRolesAction} className="space-y-2">
              <input type="hidden" name="userId" value={user.id} />
              <p className="text-xs font-medium text-[var(--text-muted)]">Roles</p>
              <SearchableSelect
                name="roleIds"
                multiple
                options={roles}
                defaultValue={user.roleIds}
              />
              <Button type="submit" variant="outline" size="sm" className="w-full">
                <ShieldCheck className="size-3.5" />
                Save roles
              </Button>
            </form>
          ) : null}

          {canManage ? (
            <>
              <form action={setUserStatusAction} className="space-y-2">
                <input type="hidden" name="userId" value={user.id} />
                <p className="text-xs font-medium text-[var(--text-muted)]">Status</p>
                <SearchableSelect
                  name="status"
                  clearable={false}
                  defaultValue={user.status}
                  disabled={isSelf}
                  options={[
                    { value: "ACTIVE", label: "Active" },
                    { value: "SUSPENDED", label: "Suspended" },
                    { value: "DISABLED", label: "Disabled" },
                    { value: "INVITED", label: "Invited" },
                  ]}
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isSelf}
                >
                  Update status
                </Button>
                {isSelf ? (
                  <p className="text-xs text-[var(--text-subtle)]">
                    You cannot change your own status: that is how people lock
                    themselves out.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--text-subtle)]">
                    Anything other than Active also ends every session this account
                    currently holds.
                  </p>
                )}
              </form>

              <form action={resetAction} className="space-y-2">
                <input type="hidden" name="userId" value={user.id} />
                <p className="text-xs font-medium text-[var(--text-muted)]">Password</p>
                {reset.temporaryPassword ? (
                  <Alert tone="success">
                    <p className="text-xs">Hand this over once, then it is gone:</p>
                    <p className="numeric mt-1 text-base font-semibold">
                      {reset.temporaryPassword}
                    </p>
                  </Alert>
                ) : null}
                {reset.error ? <Alert tone="danger">{reset.error}</Alert> : null}
                <Button type="submit" variant="outline" size="sm" className="w-full">
                  <KeyRound className="size-3.5" />
                  Issue a temporary password
                </Button>
                <p className="text-xs text-[var(--text-subtle)]">
                  Signs the account out everywhere and forces a new password at next
                  sign-in.
                </p>
              </form>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
