import type { Metadata } from "next";
import { CalendarDays, Leaf } from "lucide-react";

import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import {
  DAYS,
  SITTINGS,
  allergenLabel,
  cycleWeekFor,
  isoDay,
  menuGaps,
} from "@/lib/cafeteria-rules";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";

import { ActivateMenuForm, DishButton, MenuButton } from "./menu-forms";

export const metadata: Metadata = { title: "Menu" };
export const dynamic = "force-dynamic";

/**
 * The rota.
 *
 * A grid of week against day, one column per sitting the school serves. It is
 * the shape a kitchen already keeps this in, usually on a laminated sheet by
 * the door, and the point of putting it here is that the allergens travel with
 * the dish to the counter instead of living in somebody's head.
 */
export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ menu?: string }>;
}) {
  const user = await requirePermission("cafeteria.read");
  const canManage = userCan(user, "cafeteria.menu.manage");
  const { menu: requested } = await searchParams;

  const [menus, years, terms] = await Promise.all([
    db.mealMenu.findMany({
      orderBy: [{ isActive: "desc" }, { startsOn: "desc" }],
      select: {
        id: true,
        name: true,
        cycleWeeks: true,
        startsOn: true,
        isActive: true,
        notes: true,
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.academicYear.findMany({
      orderBy: { startDate: "desc" },
      select: { id: true, name: true },
    }),
    db.term.findMany({
      orderBy: [{ academicYear: { startDate: "desc" } }, { sequence: "asc" }],
      select: { id: true, name: true, academicYear: { select: { name: true } } },
    }),
  ]);

  const chosen = menus.find((menu) => menu.id === requested) ?? menus[0] ?? null;

  const items = chosen
    ? await db.mealMenuItem.findMany({
        where: { menuId: chosen.id },
        orderBy: [{ weekNumber: "asc" }, { dayOfWeek: "asc" }],
        select: {
          id: true,
          weekNumber: true,
          dayOfWeek: true,
          sitting: true,
          dish: true,
          accompaniment: true,
          allergens: true,
          isVegetarian: true,
          notes: true,
        },
      })
    : [];

  // Which sittings this menu actually uses, so a day school that never serves
  // supper is not shown four empty columns for every day of the cycle.
  const used = new Set(items.map((item) => item.sitting));
  const columns = SITTINGS.filter(
    (sitting) => used.has(sitting.value) || sitting.value === "LUNCH",
  );

  const gaps = chosen
    ? menuGaps(items, chosen.cycleWeeks, columns.map((column) => column.value))
    : [];

  const today = new Date();
  const currentWeek = chosen
    ? cycleWeekFor(today, chosen.startsOn, chosen.cycleWeeks)
    : null;

  return (
    <>
      <PageHeader
        title="Menu"
        description="What the kitchen cooks, on a repeating cycle, and what is in it."
        action={
          canManage ? (
            <MenuButton
              years={years.map((year) => ({ value: year.id, label: year.name }))}
              terms={terms.map((term) => ({
                value: term.id,
                label: `${term.name}`,
                description: term.academicYear.name,
              }))}
            />
          ) : null
        }
      />

      {menus.length === 0 ? (
        <Alert tone="info">
          No menu yet. Without one the counter cannot say what is being served
          or what is in it, which also means no allergy warnings: a warning
          needs a list of what is on the plate to compare against.
        </Alert>
      ) : null}

      {menus.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {menus.map((menu) => (
            <a
              key={menu.id}
              href={`/cafeteria/menu?menu=${menu.id}`}
              className={
                menu.id === chosen?.id
                  ? "rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-1.5 text-sm font-medium text-[var(--primary)]"
                  : "rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
              }
            >
              {menu.name}
              {menu.isActive ? " · live" : ""}
            </a>
          ))}
        </div>
      ) : null}

      {chosen ? (
        <>
          <Card className="mb-4">
            <CardHeader
              title={chosen.name}
              description={`${chosen.cycleWeeks}-week cycle counting from ${formatDate(chosen.startsOn)}. ${chosen.academicYear.name}${chosen.term ? `, ${chosen.term.name}` : ""}.`}
              action={
                chosen.isActive ? (
                  <Badge tone="success">Live</Badge>
                ) : canManage ? (
                  <ActivateMenuForm menuId={chosen.id} name={chosen.name} />
                ) : (
                  <Badge tone="neutral">Not live</Badge>
                )
              }
            />
            <CardBody className="space-y-2">
              {chosen.isActive && currentWeek ? (
                <p className="text-sm">
                  <CalendarDays className="mr-1.5 inline size-3.5 text-[var(--text-subtle)]" />
                  This week is week {currentWeek} of {chosen.cycleWeeks}.
                </p>
              ) : null}

              {gaps.length ? (
                <Alert tone="warning">
                  {gaps.length} {gaps.length === 1 ? "sitting has" : "sittings have"} nothing on
                  the rota. The usual cause is a cycle filled in for week one and
                  not the rest. A sitting with no dish serves with no allergens
                  listed, and no allergens listed means no warnings.
                </Alert>
              ) : null}

              {chosen.notes ? (
                <p className="text-sm text-[var(--text-muted)]">{chosen.notes}</p>
              ) : null}
            </CardBody>
          </Card>

          {Array.from({ length: chosen.cycleWeeks }, (_, index) => index + 1).map((week) => (
            <Card key={week} className="mb-4">
              <CardHeader
                title={`Week ${week}`}
                action={
                  chosen.isActive && currentWeek === week ? (
                    <Badge tone="info">This week</Badge>
                  ) : null
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase">
                        Day
                      </th>
                      {columns.map((column) => (
                        <th
                          key={column.value}
                          className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-[var(--text-subtle)] uppercase"
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {DAYS.map((day) => (
                      <tr
                        key={day.value}
                        className={
                          chosen.isActive &&
                          currentWeek === week &&
                          isoDay(today) === day.value
                            ? "bg-[var(--primary-soft)]"
                            : undefined
                        }
                      >
                        <td className="px-4 py-2.5 font-medium">{day.label}</td>
                        {columns.map((column) => {
                          const item = items.find(
                            (candidate) =>
                              candidate.weekNumber === week &&
                              candidate.dayOfWeek === day.value &&
                              candidate.sitting === column.value,
                          );

                          return (
                            <td key={column.value} className="px-4 py-2.5 align-top">
                              {item ? (
                                <div className="min-w-0">
                                  <p className="font-medium">{item.dish}</p>
                                  {item.accompaniment ? (
                                    <p className="text-xs text-[var(--text-muted)]">
                                      with {item.accompaniment}
                                    </p>
                                  ) : null}
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {item.isVegetarian ? (
                                      <Badge tone="success">
                                        <Leaf className="size-2.5" />
                                      </Badge>
                                    ) : null}
                                    {item.allergens.map((allergen) => (
                                      <Badge key={allergen} tone="warning">
                                        {allergenLabel(allergen)}
                                      </Badge>
                                    ))}
                                  </div>
                                  {canManage ? (
                                    <DishButton
                                      menuId={chosen.id}
                                      week={week}
                                      day={day.value}
                                      sitting={column.value}
                                      values={{
                                        id: item.id,
                                        dish: item.dish,
                                        accompaniment: item.accompaniment ?? "",
                                        allergens: item.allergens,
                                        isVegetarian: item.isVegetarian,
                                        notes: item.notes ?? "",
                                      }}
                                    />
                                  ) : null}
                                </div>
                              ) : canManage ? (
                                <DishButton
                                  menuId={chosen.id}
                                  week={week}
                                  day={day.value}
                                  sitting={column.value}
                                />
                              ) : (
                                <span className="text-[var(--text-subtle)]">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </>
      ) : null}
    </>
  );
}
