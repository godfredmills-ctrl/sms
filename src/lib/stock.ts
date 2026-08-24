import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "./db";
import {
  formatQuantity,
  MILLI,
  runningStock,
  stockLevel,
  storeTotals,
  suggestedOrderMilli,
  toMilli,
  type Movement,
  type MovementKind,
  type StockState,
} from "./stock-rules";

/**
 * The store, read.
 *
 * The balance of an item is the sum of its movements — there is no cached
 * quantity column, deliberately. A stored balance and a movement history are
 * two answers to the same question, and the day they disagree is the day
 * nobody can tell which is right. Replaying is cheap: a school store has
 * thousands of movements, not millions, and the index on (itemId, occurredOn)
 * is what makes it so.
 */

/** Prisma hands Decimal back as an object; the rules module wants thousandths. */
function decimalToMilli(value: Prisma.Decimal | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value) * MILLI);
}

export type StoreRow = {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  locationName: string | null;
  quantityMilli: number;
  quantityLabel: string;
  valueMinor: number;
  averageCostMinor: number | null;
  level: ReturnType<typeof stockLevel>;
  reorderLevelMilli: number | null;
  suggestedOrderMilli: number;
  perishable: boolean;
  expiresOn: Date | null;
  lastMovedOn: Date | null;
  oversold: number;
};

export type StoreFilter = {
  categoryId?: string;
  locationId?: string;
  search?: string;
  /** Out of stock, low, expired or expiring. */
  needsAttention?: boolean;
  includeInactive?: boolean;
};

function where(filter: StoreFilter): Prisma.StockItemWhereInput {
  const search = filter.search?.trim();
  return {
    ...(filter.includeInactive ? {} : { active: true }),
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.locationId ? { locationId: filter.locationId } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

/**
 * Movements for many items at once.
 *
 * One query rather than one per item: a store page listing fifty items would
 * otherwise issue fifty-one queries, and the page a storekeeper opens every
 * morning is the wrong place to put an N+1.
 */
async function movementsByItem(itemIds: string[]) {
  if (!itemIds.length) {
    return { byItem: new Map<string, Movement[]>(), lastMoved: new Map<string, Date>() };
  }

  const rows = await db.stockMovement.findMany({
    where: { itemId: { in: itemIds } },
    // Oldest first: the weighted average depends on the order, so this is not
    // a presentation choice.
    orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }],
    select: {
      itemId: true,
      kind: true,
      quantity: true,
      unitCostMinor: true,
      occurredOn: true,
    },
  });

  const byItem = new Map<string, Movement[]>();
  const lastMoved = new Map<string, Date>();

  for (const row of rows) {
    const list = byItem.get(row.itemId) ?? [];
    list.push({
      kind: row.kind as MovementKind,
      quantityMilli: decimalToMilli(row.quantity),
      unitCostMinor: row.unitCostMinor,
    });
    byItem.set(row.itemId, list);
    // Rows arrive oldest first, so the last one seen is the most recent.
    lastMoved.set(row.itemId, row.occurredOn);
  }

  return { byItem, lastMoved };
}

export async function storeListing(
  filter: StoreFilter,
  asOf: Date,
  options: { take?: number; skip?: number } = {},
): Promise<{ rows: StoreRow[]; total: number }> {
  const [items, total] = await Promise.all([
    db.stockItem.findMany({
      where: where(filter),
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      take: options.take ?? 100,
      skip: options.skip ?? 0,
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        reorderLevel: true,
        reorderQuantity: true,
        perishable: true,
        expiresOn: true,
        category: { select: { id: true, name: true } },
        location: { select: { name: true, building: true } },
      },
    }),
    db.stockItem.count({ where: where(filter) }),
  ]);

  const { byItem, lastMoved } = await movementsByItem(items.map((item) => item.id));

  let rows: StoreRow[] = items.map((item) => {
    const state = runningStock(byItem.get(item.id) ?? []);
    const reorderLevelMilli = item.reorderLevel === null ? null : decimalToMilli(item.reorderLevel);

    return {
      id: item.id,
      code: item.code,
      name: item.name,
      categoryId: item.category.id,
      categoryName: item.category.name,
      unit: item.unit,
      locationName: item.location
        ? [item.location.name, item.location.building].filter(Boolean).join(", ")
        : null,
      quantityMilli: state.quantityMilli,
      quantityLabel: `${formatQuantity(state.quantityMilli)} ${item.unit}`,
      valueMinor: state.valueMinor,
      averageCostMinor: state.averageCostMinor,
      level: stockLevel(state.quantityMilli, reorderLevelMilli),
      reorderLevelMilli,
      suggestedOrderMilli: suggestedOrderMilli(
        state.quantityMilli,
        reorderLevelMilli,
        item.reorderQuantity === null ? null : decimalToMilli(item.reorderQuantity),
      ),
      perishable: item.perishable,
      expiresOn: item.expiresOn,
      lastMovedOn: lastMoved.get(item.id) ?? null,
      oversold: state.oversold,
    };
  });

  if (filter.needsAttention) {
    rows = rows.filter(
      (row) =>
        row.level === "OUT" ||
        row.level === "LOW" ||
        (row.quantityMilli > 0 && row.expiresOn !== null && row.expiresOn < asOf),
    );
  }

  return { rows, total };
}

/** The whole store valued — for the totals strip and the printed report. */
export async function storeSummary(filter: StoreFilter, asOf: Date) {
  const { rows } = await storeListing(filter, asOf, { take: 20_000 });

  const totals = storeTotals(
    rows.map((row) => ({
      quantityMilli: row.quantityMilli,
      valueMinor: row.valueMinor,
      reorderLevelMilli: row.reorderLevelMilli,
      expiresOn: row.expiresOn,
    })),
    asOf,
  );

  const byCategory = new Map<
    string,
    { id: string; name: string; items: number; valueMinor: number }
  >();

  for (const row of rows) {
    const entry = byCategory.get(row.categoryId) ?? {
      id: row.categoryId,
      name: row.categoryName,
      items: 0,
      valueMinor: 0,
    };
    entry.items += 1;
    entry.valueMinor += row.valueMinor;
    byCategory.set(row.categoryId, entry);
  }

  return { totals, byCategory: [...byCategory.values()], rows };
}

export type ItemDetail = Awaited<ReturnType<typeof itemDetail>>;

export async function itemDetail(id: string) {
  const item = await db.stockItem.findUnique({
    where: { id },
    include: {
      category: true,
      location: true,
      movements: {
        orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
        take: 200,
        include: {
          issuedTo: { select: { firstName: true, lastName: true } },
          vendor: { select: { name: true } },
          expense: { select: { id: true, reference: true } },
        },
      },
    },
  });

  if (!item) return null;

  // The stored order is newest first for the screen; the balance needs oldest
  // first. Reversing a copy rather than re-querying keeps the two views of the
  // same rows in step.
  const oldestFirst = [...item.movements].reverse();

  const state = runningStock(
    oldestFirst.map((row) => ({
      kind: row.kind as MovementKind,
      quantityMilli: decimalToMilli(row.quantity),
      unitCostMinor: row.unitCostMinor,
    })),
  );

  // A running balance beside each row, so a storekeeper can see where a
  // discrepancy entered rather than only that it exists.
  const balances = new Map<string, StockState>();
  const replayed: Movement[] = [];
  for (const row of oldestFirst) {
    replayed.push({
      kind: row.kind as MovementKind,
      quantityMilli: decimalToMilli(row.quantity),
      unitCostMinor: row.unitCostMinor,
    });
    balances.set(row.id, runningStock(replayed));
  }

  const reorderLevelMilli =
    item.reorderLevel === null ? null : decimalToMilli(item.reorderLevel);

  return {
    item,
    state,
    balances,
    reorderLevelMilli,
    level: stockLevel(state.quantityMilli, reorderLevelMilli),
    suggestedOrderMilli: suggestedOrderMilli(
      state.quantityMilli,
      reorderLevelMilli,
      item.reorderQuantity === null ? null : decimalToMilli(item.reorderQuantity),
    ),
  };
}

/** The balance of one item, for an action that needs to check before writing. */
export async function currentStock(itemId: string): Promise<StockState> {
  const rows = await db.stockMovement.findMany({
    where: { itemId },
    orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }],
    select: { kind: true, quantity: true, unitCostMinor: true },
  });

  return runningStock(
    rows.map((row) => ({
      kind: row.kind as MovementKind,
      quantityMilli: decimalToMilli(row.quantity),
      unitCostMinor: row.unitCostMinor,
    })),
  );
}

/**
 * The next item code in a category.
 *
 * Taken from the highest number already issued rather than from a count, for
 * the same reason asset tags are: a count reuses the code of anything deleted,
 * and two shelf labels reading the same thing is what a stock-take cannot
 * recover from.
 */
export async function nextItemCode(categoryId: string, prefix: string): Promise<string> {
  const category = await db.stockCategory.findUnique({
    where: { id: categoryId },
    select: { code: true },
  });

  const existing = await db.stockItem.findMany({
    where: { categoryId },
    select: { code: true },
    take: 5_000,
  });

  const clean = (value: string) =>
    value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  const highest = existing.reduce((max, row) => {
    const match = /(\d+)\s*$/.exec(row.code.trim());
    const sequence = match ? Number.parseInt(match[1], 10) : Number.NaN;
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);

  return `${clean(prefix) || "SCH"}/${clean(category?.code ?? "") || "GEN"}/${String(
    highest + 1,
  ).padStart(4, "0")}`;
}

/**
 * The next voucher number.
 *
 * A storekeeper writes this on the slip the person taking the goods signs, and
 * quotes it when anybody asks what happened to a sack of rice. Per calendar
 * year, and never reused.
 */
export async function nextVoucherNumber(now: Date): Promise<string> {
  const year = now.getFullYear();
  const prefix = `SIV/${year}/`;

  const latest = await db.stockMovement.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  const current = latest?.reference?.slice(prefix.length) ?? "0";
  const next = (Number.parseInt(current, 10) || 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function stockPickLists() {
  const [categories, locations, staff, vendors] = await Promise.all([
    db.stockCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true },
    }),
    db.assetLocation.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, building: true },
    }),
    db.staff.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, jobTitle: true },
    }),
    db.vendor.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true },
    }),
  ]);

  return { categories, locations, staff, vendors };
}

/** Everything issued under one voucher, for printing the slip. */
export async function voucher(reference: string) {
  const movements = await db.stockMovement.findMany({
    where: { reference },
    orderBy: { createdAt: "asc" },
    include: {
      item: { select: { code: true, name: true, unit: true } },
      issuedTo: { select: { firstName: true, lastName: true, jobTitle: true } },
    },
  });

  if (!movements.length) return null;

  return {
    reference,
    occurredOn: movements[0].occurredOn,
    issuedTo: movements[0].issuedTo,
    issuedToDept: movements[0].issuedToDept,
    recordedByLabel: movements[0].recordedByLabel,
    lines: movements.map((movement) => ({
      code: movement.item.code,
      name: movement.item.name,
      unit: movement.item.unit,
      quantityMilli: decimalToMilli(movement.quantity),
      note: movement.note,
    })),
  };
}

export { toMilli, formatQuantity };
