import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileDown, History } from "lucide-react";

import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { DATASETS } from "@/lib/reporting";
import { relativeTime } from "@/lib/utils";

import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import & export" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await requirePermission("student.import");

  const jobs = await db.dataJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      direction: true,
      entity: true,
      format: true,
      status: true,
      totalRows: true,
      successRows: true,
      errorRows: true,
      createdAt: true,
    },
  });

  const exportable = DATASETS.filter((dataset) => userCan(user, dataset.permission));

  return (
    <>
      <PageHeader
        title="Import & export"
        description="Bring students in from a spreadsheet, or take any dataset out as Excel."
        breadcrumb={
          <Link href="/students" className="hover:text-[var(--text)]">
            Students
          </Link>
        }
      />

      <div className="mb-4">
        <ImportForm />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Export to Excel"
            description="The same datasets the report builder reads, with headers, filters and frozen panes."
          />
          <CardBody className="flex flex-wrap gap-2">
            {exportable.map((dataset) => (
              <a
                key={dataset.key}
                href={`/api/export?dataset=${dataset.key}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 text-sm font-medium hover:bg-[var(--bg-subtle)]"
              >
                <Download className="size-3.5" />
                {dataset.label}
              </a>
            ))}
            {exportable.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                You do not have read permission on any dataset.
              </p>
            ) : null}
          </CardBody>
          <CardBody className="border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
            Exports escape cells beginning with =, +, − or @. Without that, a value
            typed into a notes field runs as a formula the moment somebody opens the
            file.
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Recent jobs"
            description="Imports and exports are recorded."
            action={<History className="size-4 text-[var(--text-subtle)]" />}
          />
          {jobs.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {jobs.map((job) => (
                <li
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm">
                      <Badge
                        tone={job.direction === "IMPORT" ? "violet" : "info"}
                        className="mr-1.5"
                      >
                        {job.direction}
                      </Badge>
                      {job.entity} · {job.format}
                    </p>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {job.successRows} of {job.totalRows} rows
                      {job.errorRows ? ` · ${job.errorRows} failed` : ""} ·{" "}
                      {relativeTime(job.createdAt)}
                    </p>
                  </div>
                  <Badge tone={job.status === "COMPLETED" ? "success" : "warning"}>
                    {job.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<FileDown className="size-5" />}
              title="No jobs yet"
              description="Imports and exports appear here once you run one."
            />
          )}
        </Card>
      </div>
    </>
  );
}
