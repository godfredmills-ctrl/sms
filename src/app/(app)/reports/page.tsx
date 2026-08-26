import type { Metadata } from "next";
import { BarChart3, Database, Sparkles, Star, Trash2 } from "lucide-react";

import { Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { isAiEnabled } from "@/lib/ai/client";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { DATASETS, type Dataset } from "@/lib/reporting";
import { loadDataset } from "@/lib/reporting-data";
import { relativeTime } from "@/lib/utils";

import { deleteReportAction, toggleFavouriteAction } from "./actions";
import { ReportBuilder } from "./report-builder";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requirePermission(["report.read", "report.build"]);
  const canBuild = userCan(user, "report.build");

  // A dataset the user cannot read is not offered at all, rather than offered
  // and then refused when they press Run.
  const available: Dataset[] = DATASETS.filter((dataset) =>
    userCan(user, dataset.permission),
  );

  const [saved, runs] = await Promise.all([
    db.reportDefinition.findMany({
      where: { OR: [{ ownerId: user.id }, { isShared: true }] },
      orderBy: [{ isFavourite: "desc" }, { updatedAt: "desc" }],
      include: { owner: { select: { firstName: true, lastName: true } } },
    }),
    db.reportRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, rowCount: true, createdAt: true, status: true },
    }),
  ]);

  // Filter options come from the data itself, so a school that has never used
  // "House" never sees an empty House filter.
  const filterOptions: Record<string, Record<string, string[]>> = {};

  for (const dataset of available.slice(0, 3)) {
    const rows = await loadDataset(dataset.key);
    const perField: Record<string, string[]> = {};

    for (const field of dataset.fields.filter((entry) => entry.filterable)) {
      const values = [
        ...new Set(
          rows
            .map((row) => String(row[field.key] ?? ""))
            .filter((value) => value && value !== "-"),
        ),
      ].sort();
      // A filter with 200 distinct values is a search box, not a filter.
      if (values.length && values.length <= 60) perField[field.key] = values;
    }

    filterOptions[dataset.key] = perField;
  }

  return (
    <>
      <PageHeader
        title="Reports"
        description="Build a report over any dataset, filter it, export it, and have Claude interpret it."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Datasets available"
          value={available.length}
          hint={`${DATASETS.length - available.length} restricted by permission`}
          tone="violet"
          icon={<Database className="size-4" />}
        />
        <StatCard
          label="Saved reports"
          value={saved.length}
          tone="info"
          icon={<BarChart3 className="size-4" />}
        />
        <StatCard
          label="Runs recorded"
          value={runs.length}
          tone="teal"
        />
        <StatCard
          label="AI narratives"
          value={(await isAiEnabled()) ? "On" : "Off"}
          hint={(await isAiEnabled()) ? "Claude can interpret results" : "No API key set"}
          tone={(await isAiEnabled()) ? "success" : "neutral"}
          icon={<Sparkles className="size-4" />}
        />
      </div>

      {canBuild && available.length ? (
        <div className="mb-4">
          <ReportBuilder
            datasets={available}
            filterOptions={filterOptions}
            aiEnabled={(await isAiEnabled())}
          />
        </div>
      ) : (
        <Card className="mb-4">
          <EmptyState
            icon={<BarChart3 className="size-5" />}
            title="No datasets available to you"
            description="Reporting reads the same data as the rest of the system, so you need read permission on a module before you can report on it."
          />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Saved reports"
            description="Your own, plus anything colleagues have shared."
          />
          {saved.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {saved.map((definition) => (
                <li
                  key={definition.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{definition.name}</span>
                      <Badge tone="neutral">{definition.dataset}</Badge>
                      {definition.isShared ? <Badge tone="info">Shared</Badge> : null}
                      {definition.chartType && definition.chartType !== "TABLE" ? (
                        <Badge tone="teal">
                          <BarChart3 className="size-2.5" />
                          {definition.chartType.toLowerCase()}
                        </Badge>
                      ) : null}
                      {definition.includeAiInsights ? (
                        <Badge tone="violet">
                          <Sparkles className="size-2.5" />
                          AI
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {definition.description ??
                        (definition.owner
                          ? `${definition.owner.firstName} ${definition.owner.lastName}`
                          : "System")}
                      {definition.lastRunAt
                        ? ` · last run ${relativeTime(definition.lastRunAt)}`
                        : ""}
                    </p>
                  </div>

                  {definition.ownerId === user.id ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <form action={toggleFavouriteAction}>
                        <input type="hidden" name="id" value={definition.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          title={
                            definition.isFavourite
                              ? "Remove from favourites"
                              : "Add to favourites"
                          }
                        >
                          <Star
                            className={`size-3.5 ${
                              definition.isFavourite
                                ? "fill-[var(--warning)] text-[var(--warning)]"
                                : ""
                            }`}
                          />
                        </Button>
                      </form>
                      <form action={deleteReportAction}>
                        <input type="hidden" name="id" value={definition.id} />
                        <Button type="submit" variant="ghost" size="sm" title="Delete">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No saved reports"
              description="Tick “Save this report” when you run one to keep its configuration."
            />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent runs"
            description="Every run is recorded with its row count."
          />
          {runs.length ? (
            <ul className="divide-y divide-[var(--border)]">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className="flex items-center justify-between gap-3 px-5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{run.name}</p>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {relativeTime(run.createdAt)}
                    </p>
                  </div>
                  <span className="numeric shrink-0 text-xs text-[var(--text-muted)]">
                    {run.rowCount.toLocaleString()} rows
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing run yet" />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardBody className="text-xs text-[var(--text-muted)]">
          <p className="mb-1.5 font-medium text-[var(--text)]">
            Why there is no SQL box
          </p>
          <p>
            Reports are declarative: a dataset, some columns, some filters. Letting
            people write their own queries would be more powerful and would hand
            anyone with report access the ability to read every table in the database,
            including password hashes and session tokens. The seven datasets above are
            the entire surface area on purpose, and each one still enforces the
            permission on the data it reads.
          </p>
        </CardBody>
      </Card>
    </>
  );
}
