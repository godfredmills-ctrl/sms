import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, ShieldCheck, UserCheck, Users } from "lucide-react";

import { Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";

import { InviteForm } from "./invite-form";
import { UsersTable, type UserRow } from "./users-table";

export const metadata: Metadata = { title: "Users & roles" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requirePermission(["user.read", "user.role.manage"]);
  const canManage = userCan(user, "user.manage");
  const canManageRoles = userCan(user, "user.role.manage");

  const now = new Date();

  const [users, roles] = await Promise.all([
    db.user.findMany({
      orderBy: [{ status: "asc" }, { lastName: "asc" }],
      take: 2000,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        email: true,
        phone: true,
        avatarUrl: true,
        portal: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        mustChangePassword: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
        _count: {
          select: {
            sessions: { where: { revokedAt: null, expiresAt: { gt: now } } },
          },
        },
      },
    }),
    db.role.findMany({
      orderBy: { rank: "asc" },
      select: {
        id: true,
        name: true,
        key: true,
        portal: true,
        _count: { select: { users: true } },
      },
    }),
  ]);

  const rows: UserRow[] = users.map((entry) => ({
    id: entry.id,
    name: fullName(entry),
    email: entry.email,
    phone: entry.phone,
    avatarUrl: entry.avatarUrl,
    portal: entry.portal,
    status: entry.status,
    roleNames: entry.roles.map((link) => link.role.name),
    roleIds: entry.roles.map((link) => link.role.id),
    lastLoginAt: entry.lastLoginAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    activeSessions: entry._count.sessions,
    mustChangePassword: entry.mustChangePassword,
  }));

  const active = rows.filter((row) => row.status === "ACTIVE").length;
  const signedIn = rows.filter((row) => row.activeSessions > 0).length;
  const temporary = rows.filter((row) => row.mustChangePassword).length;

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Accounts, what each one can do, and who is currently signed in."
        action={
          canManageRoles ? (
            <Link
              href="/users/roles"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--bg-subtle)]"
            >
              <ShieldCheck className="size-4" />
              Roles & permissions
            </Link>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Accounts"
          value={rows.length.toLocaleString()}
          tone="violet"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Active"
          value={active.toLocaleString()}
          hint={`${rows.length - active} inactive`}
          tone="success"
          icon={<UserCheck className="size-4" />}
        />
        <StatCard label="Signed in now" value={signedIn} tone="info" />
        <StatCard
          label="Temporary passwords"
          value={temporary}
          hint="Not yet changed by the user"
          tone={temporary ? "warning" : "neutral"}
          icon={<KeyRound className="size-4" />}
        />
      </div>

      <div className={canManage ? "grid gap-4 xl:grid-cols-[1fr_340px]" : ""}>
        <UsersTable
          rows={rows}
          roles={roles.map((role) => ({
            value: role.id,
            label: role.name,
            description: `${role.portal.toLowerCase()} · ${role._count.users} users`,
            group: role.portal,
          }))}
          canManage={canManage}
          canManageRoles={canManageRoles}
          currentUserId={user.id}
        />

        {canManage ? (
          <div>
            <Card>
              <CardHeader
                title="New account"
                description="Issues a one-time password you hand over directly."
              />
              <InviteForm
                roles={roles.map((role) => ({
                  value: role.id,
                  label: role.name,
                  description: role.key,
                  group: role.portal,
                }))}
              />
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
