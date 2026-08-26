"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";

import { DataTable, type Column } from "@/components/data-table";
import { Badge, Button } from "@/components/ui";
import { formatDateTime, humanise, relativeTime } from "@/lib/utils";

export type AuditRow = {
  id: string;
  action: string;
  module: string;
  actor: string;
  entity: string | null;
  entityId: string | null;
  summary: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  changes: string | null;
  createdAt: string;
};

/** Colour by what the action does, not by module, so risk reads at a glance. */
function toneFor(action: string) {
  if (/(delete|revoke|suspend|disqualif|reject|cancel)/.test(action)) return "danger";
  if (/(create|invite|issue|open|publish|approve)/.test(action)) return "success";
  if (/(login|logout|session)/.test(action)) return "info";
  if (/(password|role|permission|status)/.test(action)) return "warning";
  return "neutral";
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const columns: Array<Column<AuditRow>> = [
    {
      id: "createdAt",
      header: "When",
      accessor: (row) => row.createdAt,
      cell: (row) => (
        <span title={formatDateTime(row.createdAt)} className="whitespace-nowrap">
          {relativeTime(row.createdAt)}
        </span>
      ),
      width: "140px",
    },
    {
      id: "actor",
      header: "Who",
      accessor: (row) => row.actor,
      filter: { type: "select", label: "Actor" },
    },
    {
      id: "action",
      header: "Action",
      accessor: (row) => row.action,
      cell: (row) => <Badge tone={toneFor(row.action)}>{row.action}</Badge>,
      filter: { type: "tags", label: "Action" },
    },
    {
      id: "module",
      header: "Module",
      accessor: (row) => row.module,
      cell: (row) => humanise(row.module),
      filter: { type: "select", label: "Module" },
      priority: 2,
    },
    {
      id: "summary",
      header: "Detail",
      accessor: (row) => row.summary ?? "",
      cell: (row) => (
        <span className="text-[var(--text-muted)]">{row.summary ?? "-"}</span>
      ),
      sortable: false,
    },
    {
      id: "entity",
      header: "Record",
      accessor: (row) => row.entity ?? "",
      filter: { type: "select", label: "Record type" },
      priority: 3,
    },
    {
      id: "ipAddress",
      header: "IP",
      accessor: (row) => row.ipAddress ?? "",
      priority: 3,
    },
    {
      id: "actions",
      header: "",
      sortable: false,
      searchable: false,
      width: "48px",
      cell: (row) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" title="Inspect" onClick={() => setDetail(row)}>
            <Eye className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        partial
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        storageKey="audit"
        exportFileName="audit-trail"
        searchPlaceholder="Search by actor, action, record or detail…"
        emptyTitle="Nothing recorded yet"
        initialSort={{ columnId: "createdAt", direction: "desc" }}
        pageSize={50}
      />

      {detail ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 cursor-default"
            onClick={() => setDetail(null)}
          />
          <div className="card relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{detail.action}</p>
                <p className="text-xs text-[var(--text-subtle)]">
                  {detail.actor} · {formatDateTime(detail.createdAt)}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 text-sm">
              {detail.summary ? <p>{detail.summary}</p> : null}

              <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--text-muted)]">Record</dt>
                  <dd>
                    {detail.entity ?? "-"}
                    {detail.entityId ? (
                      <span className="ml-1 font-mono text-[10px] text-[var(--text-subtle)]">
                        {detail.entityId}
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)]">IP address</dt>
                  <dd className="numeric">{detail.ipAddress ?? "-"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[var(--text-muted)]">Device</dt>
                  <dd className="break-all">{detail.userAgent ?? "-"}</dd>
                </div>
              </dl>

              {detail.changes ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">
                    Changes
                  </p>
                  <pre className="overflow-x-auto rounded-lg bg-[var(--bg-inset)] p-3 font-mono text-[11px] whitespace-pre-wrap">
                    {detail.changes}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
