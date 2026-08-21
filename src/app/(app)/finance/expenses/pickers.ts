import "server-only";

import type { SelectOption } from "@/components/select-search";
import { db } from "@/lib/db";
import { CATEGORY_KINDS } from "@/lib/expense-labels";

/**
 * The category and vendor pickers, loaded once for whichever form is
 * rendering.
 *
 * Shared between recording a bill and editing one, so the two cannot offer
 * different lists — and so an inactive category stays selectable on a bill
 * that already uses it. Dropping it from the list of an existing bill would
 * make the form silently re-categorise it on the next save, which is how a
 * closed line on last year's statement acquires new spending.
 */
export async function expensePickers(keepCategoryId?: string | null): Promise<{
  categories: SelectOption[];
  vendors: SelectOption[];
}> {
  const [categories, vendors] = await Promise.all([
    db.expenseCategory.findMany({
      where: keepCategoryId
        ? { OR: [{ active: true }, { id: keepCategoryId }] }
        : { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, code: true, active: true },
    }),
    db.vendor.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: 1000,
      select: { id: true, name: true, supplies: true },
    }),
  ]);

  const kindLabel = new Map<string, string>(
    CATEGORY_KINDS.map((entry) => [entry.value, entry.label]),
  );

  return {
    categories: categories.map((category) => ({
      value: category.id,
      label: category.name,
      description:
        [
          category.code,
          kindLabel.get(category.kind) ?? category.kind,
          category.active ? null : "no longer in use",
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
    })),
    vendors: vendors.map((vendor) => ({
      value: vendor.id,
      label: vendor.name,
      description: vendor.supplies ?? undefined,
    })),
  };
}

/** Today as YYYY-MM-DD, for a date input's default. */
export function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}
