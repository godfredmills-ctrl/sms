import type { Metadata } from "next";
import { History, ShieldCheck, Users } from "lucide-react";

import { PageHeader, StatCard } from "@/components/ui";
import { Pager, pageOf } from "@/components/pager";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";

import { AuditTable, type AuditRow } from "./audit-table";

export const metadata: Metadata = { title: "Audit trail" };
export const dynamic = "force-dynamic";

/**
 * Entries per page. It used to be a flat 1000-row window with nothing beyond
 * it — and an audit trail whose older half cannot be reached is not an audit
 * trail. A school investigating who changed a mark last term was looking at a
 * list that had silently stopped.
 */
const PER_PAGE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("user.audit.read");

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [entries, total, todayCount] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        summary: true,
        ipAddress: true,
        userAgent: true,
        changes: true,
        createdAt: true,
        actorLabel: true,
        user: { select: { firstName: true, lastName: true, otherNames: true } },
      },
    }),
    db.auditLog.count(),
    db.auditLog.count({ where: { createdAt: { gte: since } } }),
  ]);

  const rows: AuditRow[] = entries.map((entry) => ({
    id: entry.id,
    action: entry.action,
    module: entry.action.split(".")[0] ?? "system",
    // actorLabel is the denormalised copy: it keeps history readable after the
    // account is deleted, which is exactly when an audit trail matters most.
    actor: entry.user ? fullName(entry.user) : (entry.actorLabel ?? "System"),
    entity: entry.entity,
    entityId: entry.entityId,
    summary: entry.summary,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    changes: entry.changes ? JSON.stringify(entry.changes, null, 2) : null,
    createdAt: entry.createdAt.toISOString(),
  }));

  const sensitive = rows.filter((row) =>
    /(delete|revoke|password|role|permission|status|suspend)/.test(row.action),
  ).length;

  const actors = new Set(rows.map((row) => row.actor)).size;

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every consequential action, who took it and when."
        action={<RefreshButton />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Entries"
          value={total.toLocaleString()}
          tone="violet"
          icon={<History className="size-4" />}
        />
        <StatCard
          label="Last 24 hours"
          value={todayCount.toLocaleString()}
          tone="info"
        />
        <StatCard
          label="People acting"
          value={actors}
          hint="In the loaded window"
          tone="teal"
          icon={<Users className="size-4" />}
        />
        <StatCard
          label="Security-relevant"
          value={sensitive}
          hint="Roles, passwords, deletions"
          tone={sensitive ? "warning" : "success"}
          icon={<ShieldCheck className="size-4" />}
        />
      </div>

      <AuditTable rows={rows} />

      <Pager
        basePath="/audit"
        searchParams={params}
        page={page}
        perPage={PER_PAGE}
        total={total}
        label="entries"
      />
    </>
  );
}
