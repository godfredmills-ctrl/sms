import type { Metadata } from "next";
import { CheckCircle2, EyeOff, Layers, Send, Tag } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, toMajor } from "@/lib/money";
import { formatDate, humanise } from "@/lib/utils";

import { setStructureItemAction, toggleStructurePublishedAction } from "../actions";
import { CategoryForm, StructureForm } from "./forms";

export const metadata: Metadata = { title: "Fee structures" };
export const dynamic = "force-dynamic";

export default async function StructuresPage() {
  await requirePermission("finance.fee.manage");

  const [structures, categories, years, levels] = await Promise.all([
    db.feeStructure.findMany({
      orderBy: [{ academicYear: { startDate: "desc" } }, { name: "asc" }],
      include: {
        academicYear: { select: { name: true, isCurrent: true } },
        term: { select: { name: true } },
        classLevel: { select: { name: true } },
        items: { include: { category: true } },
      },
    }),
    db.feeCategory.findMany({
      orderBy: [{ sortKey: "asc" }, { name: "asc" }],
    }),
    db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        isCurrent: true,
        terms: { orderBy: { sequence: "asc" }, select: { id: true, name: true } },
      },
    }),
    db.classLevel.findMany({
      orderBy: { sequence: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const published = structures.filter((structure) => structure.isPublished);
  const currentYear = years.find((year) => year.isCurrent);
  const currentPublished = published.filter(
    (structure) => structure.academicYear.isCurrent,
  );

  const totalFor = (items: Array<{ amountMinor: number; isOptional: boolean }>) =>
    items.reduce((sum, item) => sum + (item.isOptional ? 0 : item.amountMinor), 0);

  return (
    <>
      <PageHeader
        title="Fee structures"
        description="What each band of student is charged. Bulk billing reads these and nothing else."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Structures"
          value={structures.length}
          tone="violet"
          icon={<Layers className="size-4" />}
        />
        <StatCard
          label="Published"
          value={published.length}
          hint="Only these are billable"
          tone={published.length ? "success" : "warning"}
          icon={<CheckCircle2 className="size-4" />}
        />
        <StatCard
          label="Fee categories"
          value={categories.length}
          tone="info"
          icon={<Tag className="size-4" />}
        />
        <StatCard
          label="Live this year"
          value={currentPublished.length}
          hint={currentYear?.name ?? "No current year"}
          tone={currentPublished.length ? "teal" : "danger"}
        />
      </div>

      {currentPublished.length === 0 ? (
        <Alert tone="warning" className="mb-4">
          No published structure covers the current academic year, so bulk billing
          would produce nothing. Publish one before running term invoices.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {structures.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Layers className="size-5" />}
                title="No fee structures"
                description="Create one, add its fee lines, then publish it."
              />
            </Card>
          ) : null}

          {structures.map((structure) => {
            const total = totalFor(structure.items);
            const used = new Set(structure.items.map((item) => item.categoryId));

            return (
              <Card key={structure.id}>
                <CardHeader
                  title={structure.name}
                  description={[
                    structure.academicYear.name,
                    structure.term?.name ?? "All terms",
                    structure.classLevel?.name ?? "All levels",
                    humanise(structure.boarderType ?? "ALL"),
                    humanise(structure.studentType ?? "ALL"),
                  ].join(" · ")}
                  action={
                    <>
                      <Badge tone={structure.isPublished ? "success" : "warning"}>
                        {structure.isPublished ? "Published" : "Draft"}
                      </Badge>
                      <form action={toggleStructurePublishedAction}>
                        <input type="hidden" name="id" value={structure.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={!structure.isPublished && structure.items.length === 0}
                        >
                          {structure.isPublished ? (
                            <>
                              <EyeOff className="size-3.5" />
                              Withdraw
                            </>
                          ) : (
                            <>
                              <Send className="size-3.5" />
                              Publish
                            </>
                          )}
                        </Button>
                      </form>
                    </>
                  }
                />

                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-[var(--text-muted)]">
                      Compulsory total per student
                    </span>
                    <span className="numeric text-lg font-semibold">
                      {formatMoney(total)}
                    </span>
                  </div>

                  {structure.dueDate ? (
                    <p className="text-xs text-[var(--text-subtle)]">
                      Due {formatDate(structure.dueDate)}
                      {structure.minimumFirstPaymentMinor
                        ? ` · minimum first payment ${formatMoney(structure.minimumFirstPaymentMinor)}`
                        : ""}
                    </p>
                  ) : null}

                  <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                    {categories.map((category) => {
                      const item = structure.items.find(
                        (entry) => entry.categoryId === category.id,
                      );
                      return (
                        <li key={category.id} className="py-1.5">
                          <form
                            action={setStructureItemAction}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input
                              type="hidden"
                              name="structureId"
                              value={structure.id}
                            />
                            <input type="hidden" name="categoryId" value={category.id} />

                            <span className="min-w-0 flex-1 text-sm">
                              {category.name}
                              {category.isOptional ? (
                                <Badge tone="neutral" className="ml-1.5">
                                  Optional
                                </Badge>
                              ) : null}
                              {!used.has(category.id) ? (
                                <span className="ml-1.5 text-xs text-[var(--text-subtle)]">
                                  not charged
                                </span>
                              ) : null}
                            </span>

                            <Input
                              name="amount"
                              inputMode="decimal"
                              defaultValue={item ? toMajor(item.amountMinor) : ""}
                              placeholder="0.00"
                              aria-label={`${category.name} amount`}
                              className="w-28 text-right"
                            />
                            <Button type="submit" variant="ghost" size="sm">
                              Save
                            </Button>
                          </form>
                        </li>
                      );
                    })}
                  </ul>

                  <p className="text-xs text-[var(--text-subtle)]">
                    Setting an amount to zero removes the line — billing a category at
                    nothing and leaving it off produce the same invoice.
                  </p>
                </CardBody>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="New structure" />
            <StructureForm
              years={years.map((year) => ({
                value: year.id,
                label: year.name,
                description: year.isCurrent ? "Current" : undefined,
              }))}
              terms={years.flatMap((year) =>
                year.terms.map((term) => ({
                  value: term.id,
                  label: term.name,
                  group: year.name,
                })),
              )}
              levels={levels.map((level) => ({ value: level.id, label: level.name }))}
            />
          </Card>

          <Card>
            <CardHeader
              title="Fee categories"
              description="The lines a bill can be made of."
            />
            <ul className="divide-y divide-[var(--border)]">
              {categories.map((category) => (
                <li
                  key={category.id}
                  className="flex items-center justify-between gap-2 px-5 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">{category.name}</span>
                  <div className="flex shrink-0 gap-1">
                    {category.isRecurring ? (
                      <Badge tone="info">Termly</Badge>
                    ) : (
                      <Badge tone="neutral">One-off</Badge>
                    )}
                    {category.isOptional ? <Badge tone="warning">Optional</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
            <CategoryForm />
          </Card>
        </div>
      </div>
    </>
  );
}
