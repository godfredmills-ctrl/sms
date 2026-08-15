import type { Metadata } from "next";
import { AlertTriangle, History, ShieldCheck, Users } from "lucide-react";

import { Alert, PageHeader, StatCard } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";

import { AuditTable, type AuditRow } from "./audit-table";

export const metadata: Metadata = { title: "Audit trail" };
export const dynamic = "force-dynamic";

/** How many entries the page holds. Beyond this, filter or export. */
const WINDOW = 1000;

export default async function AuditPage() {
  await requirePermission("user.audit.read");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [entries, total, todayCount] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: WINDOW,
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

      {total > WINDOW ? (
        <Alert tone="info" className="mb-4">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Showing the {WINDOW.toLocaleString()} most recent entries of{" "}
            {total.toLocaleString()}. Filter or export to work with the rest — the
            page deliberately does not load them all.
          </span>
        </Alert>
      ) : null}

      <AuditTable rows={rows} />
    </>
  );
}
