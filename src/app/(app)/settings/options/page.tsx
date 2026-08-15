import type { Metadata } from "next";
import { Check, ListChecks, Lock, Plus, Star } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { humanise } from "@/lib/utils";

import {
  addOptionItemAction,
  setDefaultOptionAction,
  toggleOptionItemAction,
} from "../actions";
import { OptionSetForm } from "./option-set-form";

export const metadata: Metadata = { title: "Dropdown options" };
export const dynamic = "force-dynamic";

export default async function OptionsPage() {
  await requirePermission("settings.option.manage");

  const sets = await db.optionSet.findMany({
    orderBy: [{ entity: "asc" }, { label: "asc" }],
    include: { items: { orderBy: [{ sortKey: "asc" }, { label: "asc" }] } },
  });

  const totalItems = sets.reduce((sum, set) => sum + set.items.length, 0);
  const inactive = sets.reduce(
    (sum, set) => sum + set.items.filter((item) => !item.isActive).length,
    0,
  );

  return (
    <>
      <PageHeader
        title="Dropdown options"
        description="Every select in the system is backed by one of these lists. Add your own values without a developer."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Lists"
          value={sets.length}
          tone="violet"
          icon={<ListChecks className="size-4" />}
        />
        <StatCard label="Options" value={totalItems} tone="info" />
        <StatCard
          label="System lists"
          value={sets.filter((set) => set.isSystem).length}
          hint="Extendable, not deletable"
          tone="teal"
          icon={<Lock className="size-4" />}
        />
        <StatCard
          label="Retired options"
          value={inactive}
          hint="Hidden from new entries"
          tone={inactive ? "warning" : "neutral"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {sets.map((set) => (
            <Card key={set.id}>
              <CardHeader
                title={set.label}
                description={
                  set.description ??
                  `${set.key}${set.entity ? ` · ${humanise(set.entity)}` : ""}`
                }
                action={
                  <>
                    {set.isSystem ? (
                      <Badge tone="neutral">
                        <Lock className="size-2.5" />
                        System
                      </Badge>
                    ) : null}
                    <Badge tone="info">{set.items.length}</Badge>
                  </>
                }
              />
              <CardBody className="space-y-3">
                {set.items.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {set.items.map((item) => (
                      <li
                        key={item.id}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                          item.isActive
                            ? "border-[var(--border-strong)]"
                            : "border-dashed border-[var(--border)] text-[var(--text-subtle)] line-through"
                        }`}
                      >
                        {item.colour ? (
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: item.colour }}
                          />
                        ) : null}
                        <span>{item.label}</span>
                        {item.isDefault ? (
                          <Star
                            className="size-3 text-[var(--warning)]"
                            aria-label="Default"
                          />
                        ) : null}

                        {!item.isDefault && item.isActive ? (
                          <form action={setDefaultOptionAction} className="contents">
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="setId" value={set.id} />
                            <button
                              type="submit"
                              title="Make default"
                              className="text-[var(--text-subtle)] hover:text-[var(--warning)]"
                            >
                              <Star className="size-3" />
                            </button>
                          </form>
                        ) : null}

                        <form action={toggleOptionItemAction} className="contents">
                          <input type="hidden" name="id" value={item.id} />
                          <button
                            type="submit"
                            title={item.isActive ? "Retire this option" : "Restore"}
                            className="text-[var(--text-subtle)] hover:text-[var(--text)]"
                          >
                            {item.isActive ? "×" : <Check className="size-3" />}
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    No options yet.
                  </p>
                )}

                <form
                  action={addOptionItemAction}
                  className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-3"
                >
                  <input type="hidden" name="setId" value={set.id} />
                  <Field
                    label="Add option"
                    htmlFor={`label-${set.id}`}
                    className="min-w-[180px] flex-1"
                  >
                    <Input
                      id={`label-${set.id}`}
                      name="label"
                      required
                      placeholder="New value"
                    />
                  </Field>
                  <Field label="Colour" htmlFor={`colour-${set.id}`} className="w-24">
                    <Input
                      id={`colour-${set.id}`}
                      name="colour"
                      placeholder="#2C66CE"
                    />
                  </Field>
                  <Button type="submit" variant="outline" size="sm" className="mb-0.5">
                    <Plus className="size-3.5" />
                    Add
                  </Button>
                </form>
              </CardBody>
            </Card>
          ))}
        </div>

        <div>
          <Card>
            <CardHeader
              title="New list"
              description="Create a list, then attach it to a custom field."
            />
            <OptionSetForm />
          </Card>

          <Card className="mt-4">
            <CardBody className="text-xs text-[var(--text-muted)]">
              <p className="mb-1.5 font-medium text-[var(--text)]">
                Why options are retired, not deleted
              </p>
              <p>
                Records already pointing at a value keep their label when it is
                retired. Deleting it would leave last year&rsquo;s students showing a
                bare code on their reports, so retiring hides it from new entries
                and leaves history intact.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
