import type { Metadata } from "next";
import { Eye, EyeOff, SlidersHorizontal, Trash2 } from "lucide-react";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { humanise } from "@/lib/utils";

import { deleteCustomFieldAction, toggleCustomFieldAction } from "../actions";
import { CustomFieldForm } from "./custom-field-form";

export const metadata: Metadata = { title: "Custom fields" };
export const dynamic = "force-dynamic";

export default async function CustomFieldsPage() {
  await requirePermission("settings.customfield.manage");

  const [fields, optionSets] = await Promise.all([
    db.customFieldDef.findMany({
      orderBy: [{ entity: "asc" }, { sortKey: "asc" }],
      include: { _count: { select: { values: true } } },
    }),
    db.optionSet.findMany({
      orderBy: { label: "asc" },
      select: { id: true, label: true, key: true, _count: { select: { items: true } } },
    }),
  ]);

  const byEntity = new Map<string, typeof fields>();
  for (const field of fields) {
    const list = byEntity.get(field.entity) ?? [];
    list.push(field);
    byEntity.set(field.entity, list);
  }

  const captured = fields.reduce((sum, field) => sum + field._count.values, 0);

  return (
    <>
      <PageHeader
        title="Custom fields"
        description="Capture anything the standard profile does not cover: without waiting on a release."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Fields"
          value={fields.length}
          tone="violet"
          icon={<SlidersHorizontal className="size-4" />}
        />
        <StatCard label="Entities covered" value={byEntity.size} tone="info" />
        <StatCard
          label="Values captured"
          value={captured.toLocaleString()}
          tone="teal"
        />
        <StatCard
          label="In portals"
          value={fields.filter((field) => field.showInPortal).length}
          hint="Visible to students and parents"
          tone="success"
          icon={<Eye className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {fields.length === 0 ? (
            <Card>
              <EmptyState
                icon={<SlidersHorizontal className="size-5" />}
                title="No custom fields yet"
                description="Add one on the right: it appears on the profile immediately."
              />
            </Card>
          ) : null}

          {[...byEntity.entries()].map(([entity, entityFields]) => (
            <Card key={entity}>
              <CardHeader
                title={humanise(entity)}
                description={`${entityFields.length} field${
                  entityFields.length === 1 ? "" : "s"
                }`}
              />
              <ul className="divide-y divide-[var(--border)]">
                {entityFields.map((field) => (
                  <li
                    key={field.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-sm font-medium ${
                            field.isActive ? "" : "text-[var(--text-subtle)] line-through"
                          }`}
                        >
                          {field.label}
                        </span>
                        <Badge tone="neutral">{humanise(field.type)}</Badge>
                        {field.isRequired ? <Badge tone="warning">Required</Badge> : null}
                        {field.showInList ? <Badge tone="info">In lists</Badge> : null}
                        {field.showInPortal ? (
                          <Badge tone="success">In portals</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                        {field.key} · {field.section}
                        {field._count.values > 0
                          ? ` · ${field._count.values} value${
                              field._count.values === 1 ? "" : "s"
                            } captured`
                          : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <form action={toggleCustomFieldAction}>
                        <input type="hidden" name="id" value={field.id} />
                        <button
                          type="submit"
                          title={field.isActive ? "Hide this field" : "Show this field"}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
                        >
                          {field.isActive ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </button>
                      </form>

                      {/* Deleting drops captured values with it, so it is only
                          offered while nothing has been entered. */}
                      {field._count.values === 0 ? (
                        <form action={deleteCustomFieldAction}>
                          <input type="hidden" name="id" value={field.id} />
                          <button
                            type="submit"
                            title="Delete field"
                            className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <div>
          <Card>
            <CardHeader title="New field" />
            <CustomFieldForm
              optionSets={optionSets.map((set) => ({
                value: set.id,
                label: set.label,
                description: `${set.key} · ${set._count.items} options`,
              }))}
            />
          </Card>

          <Card className="mt-4">
            <CardBody className="text-xs text-[var(--text-muted)]">
              <p className="mb-1.5 font-medium text-[var(--text)]">
                Hidden, not deleted
              </p>
              <p>
                Once a field holds values it can be hidden but not removed. Deleting
                it would take every captured answer with it, and a hidden field
                costs nothing to keep.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
