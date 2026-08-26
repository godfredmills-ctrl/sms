import type { Metadata } from "next";
import Link from "next/link";
import { Lock, ShieldCheck, Users } from "lucide-react";

import { Badge, Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";

import { PermissionPicker } from "./permission-picker";
import { RoleForm } from "./role-form";

export const metadata: Metadata = { title: "Roles & permissions" };
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  await requirePermission("user.role.manage");

  const roles = await db.role.findMany({
    orderBy: [{ portal: "asc" }, { rank: "asc" }],
    include: {
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { users: true } },
    },
  });

  const assigned = new Set(
    roles.flatMap((role) => role.permissions.map((link) => link.permission.key)),
  );

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="What each role may do. The sidebar, every page and every action are derived from these grants."
        breadcrumb={
          <Link href="/users" className="hover:text-[var(--text)]">
            Users &amp; roles
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Roles"
          value={roles.length}
          tone="violet"
          icon={<ShieldCheck className="size-4" />}
        />
        <StatCard label="Permissions" value={PERMISSIONS.length} tone="info" />
        <StatCard
          label="Unused permissions"
          value={PERMISSIONS.length - assigned.size}
          hint="Granted to no role"
          tone={PERMISSIONS.length - assigned.size > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Assignments"
          value={roles.reduce((sum, role) => sum + role._count.users, 0)}
          tone="teal"
          icon={<Users className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardHeader
                title={role.name}
                description={role.description ?? role.key}
                action={
                  <>
                    <Badge tone="neutral">{role.portal}</Badge>
                    {role.isSystem ? (
                      <Badge tone="info">
                        <Lock className="size-2.5" />
                        System
                      </Badge>
                    ) : null}
                    <Badge tone="violet">{role._count.users} users</Badge>
                  </>
                }
              />
              <PermissionPicker
                roleId={role.id}
                permissions={PERMISSIONS}
                granted={role.permissions.map((link) => link.permission.key)}
                disabled={role.key === "super_admin"}
              />
            </Card>
          ))}
        </div>

        <div>
          <Card>
            <CardHeader
              title="New role"
              description="Starts with no permissions: grant them below once created."
            />
            <RoleForm />
          </Card>
        </div>
      </div>
    </>
  );
}
