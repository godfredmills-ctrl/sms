import "server-only";

import type { Prisma } from "@prisma/client";

import {
  assetTag,
  depreciate,
  registerTotals,
  serviceState,
  tagSequence,
  verificationState,
  type AssetCondition,
  type AssetStatus,
  type RegisterTotals,
} from "./asset-rules";
import { db } from "./db";

/**
 * The register, read.
 *
 * Every figure on screen and on the printed report comes from here and is
 * computed by `asset-rules`, so the page and the PDF cannot disagree about
 * what the school owns or what it is worth.
 */

export type RegisterRow = {
  id: string;
  tag: string;
  name: string;
  categoryId: string;
  categoryName: string;
  status: AssetStatus;
  condition: AssetCondition;
  locationName: string | null;
  custodianName: string | null;
  serialNumber: string | null;
  purchasedOn: Date | null;
  costMinor: number;
  accumulatedMinor: number;
  netBookMinor: number;
  notDepreciated: boolean;
  disposedOn: Date | null;
  serviceOverdue: boolean;
  serviceDueOn: Date | null;
  neverVerified: boolean;
  verificationStale: boolean;
  lastVerifiedOn: Date | null;
};

export type RegisterFilter = {
  categoryId?: string;
  locationId?: string;
  custodianId?: string;
  status?: string;
  condition?: string;
  /** Free text over tag, name, serial number and model. */
  search?: string;
  /** Only things that need attention: overdue service, never verified, missing. */
  needsAttention?: boolean;
};

const SELECT = {
  id: true,
  tag: true,
  name: true,
  status: true,
  condition: true,
  serialNumber: true,
  purchasedOn: true,
  costMinor: true,
  residualMinor: true,
  usefulLifeYears: true,
  disposedOn: true,
  disposalProceedsMinor: true,
  serviceIntervalMonths: true,
  lastServicedOn: true,
  lastVerifiedOn: true,
  category: { select: { id: true, name: true, usefulLifeYears: true } },
  location: { select: { name: true, building: true } },
  custodian: { select: { firstName: true, lastName: true } },
} satisfies Prisma.AssetSelect;

type Row = Prisma.AssetGetPayload<{ select: typeof SELECT }>;

/**
 * The life actually used for this asset.
 *
 * The item's own figure where it has one — a second-hand laptop does not get
 * the category's five years — and the category's otherwise. Written once here
 * because the register, the detail page and the printed report all need the
 * same answer, and a page that quietly used the category's figure while the
 * report used the item's would produce two valuations of the same school.
 */
function effectiveLife(row: Row): number | null {
  return row.usefulLifeYears ?? row.category.usefulLifeYears ?? null;
}

function toRegisterRow(row: Row, asOf: Date): RegisterRow {
  const depreciable = {
    costMinor: row.costMinor,
    residualMinor: row.residualMinor,
    usefulLifeYears: effectiveLife(row),
    purchasedOn: row.purchasedOn,
    disposedOn: row.disposedOn,
  };

  const value = depreciate(depreciable, asOf);
  const service = serviceState(
    {
      serviceIntervalMonths: row.serviceIntervalMonths,
      lastServicedOn: row.lastServicedOn,
      purchasedOn: row.purchasedOn,
      status: row.status as AssetStatus,
    },
    asOf,
  );
  const verified = verificationState(row.lastVerifiedOn, asOf);

  return {
    id: row.id,
    tag: row.tag,
    name: row.name,
    categoryId: row.category.id,
    categoryName: row.category.name,
    status: row.status as AssetStatus,
    condition: row.condition as AssetCondition,
    locationName: row.location
      ? [row.location.name, row.location.building].filter(Boolean).join(", ")
      : null,
    custodianName: row.custodian
      ? `${row.custodian.firstName} ${row.custodian.lastName}`
      : null,
    serialNumber: row.serialNumber,
    purchasedOn: row.purchasedOn,
    costMinor: row.costMinor,
    accumulatedMinor: value.accumulatedMinor,
    netBookMinor: value.netBookMinor,
    notDepreciated: value.notDepreciated,
    disposedOn: row.disposedOn,
    serviceOverdue: service.overdue,
    serviceDueOn: service.dueOn,
    neverVerified: verified.neverVerified,
    verificationStale: verified.stale,
    lastVerifiedOn: row.lastVerifiedOn,
  };
}

function where(filter: RegisterFilter): Prisma.AssetWhereInput {
  const search = filter.search?.trim();

  return {
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.locationId ? { locationId: filter.locationId } : {}),
    ...(filter.custodianId ? { custodianId: filter.custodianId } : {}),
    ...(filter.status ? { status: filter.status as AssetStatus } : {}),
    ...(filter.condition ? { condition: filter.condition as AssetCondition } : {}),
    ...(search
      ? {
          OR: [
            { tag: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { serialNumber: { contains: search, mode: "insensitive" } },
            { model: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function register(
  filter: RegisterFilter,
  asOf: Date,
  options: { take?: number; skip?: number } = {},
): Promise<{ rows: RegisterRow[]; total: number }> {
  const [records, total] = await Promise.all([
    db.asset.findMany({
      where: where(filter),
      orderBy: [{ category: { sortOrder: "asc" } }, { tag: "asc" }],
      take: options.take ?? 100,
      skip: options.skip ?? 0,
      select: SELECT,
    }),
    db.asset.count({ where: where(filter) }),
  ]);

  let rows = records.map((record) => toRegisterRow(record, asOf));

  // Applied after valuation rather than in SQL, because "needs attention"
  // is three derived conditions and none of them is a column.
  if (filter.needsAttention) {
    rows = rows.filter(
      (row) =>
        row.status === "MISSING" ||
        row.serviceOverdue ||
        (row.neverVerified && row.status !== "DISPOSED"),
    );
  }

  return { rows, total };
}

/**
 * The whole register, valued — for the totals strip and the printed report.
 *
 * Unpaginated on purpose: a total that covered only the first page would be
 * wrong in a way nobody would notice, and a school's register is thousands of
 * rows at most rather than millions.
 */
export async function registerSummary(
  filter: RegisterFilter,
  asOf: Date,
): Promise<{
  totals: RegisterTotals;
  byCategory: Array<{
    id: string;
    name: string;
    count: number;
    costMinor: number;
    netBookMinor: number;
  }>;
}> {
  const records = await db.asset.findMany({
    where: where(filter),
    orderBy: [{ category: { sortOrder: "asc" } }, { tag: "asc" }],
    take: 20_000,
    select: SELECT,
  });

  const rows = records.map((record) => toRegisterRow(record, asOf));

  const totals = registerTotals(
    records.map((record) => ({
      costMinor: record.costMinor,
      residualMinor: record.residualMinor,
      usefulLifeYears: effectiveLife(record),
      purchasedOn: record.purchasedOn,
      disposedOn: record.disposedOn,
      disposalProceedsMinor: record.disposalProceedsMinor,
      status: record.status as AssetStatus,
    })),
    asOf,
  );

  const byCategory = new Map<
    string,
    { id: string; name: string; count: number; costMinor: number; netBookMinor: number }
  >();

  for (const row of rows) {
    // Disposed assets are not part of what the school currently holds, and a
    // category total that included them would not tie to the register's own.
    if (row.status === "DISPOSED") continue;
    const entry = byCategory.get(row.categoryId) ?? {
      id: row.categoryId,
      name: row.categoryName,
      count: 0,
      costMinor: 0,
      netBookMinor: 0,
    };
    entry.count += 1;
    entry.costMinor += row.costMinor;
    entry.netBookMinor += row.netBookMinor;
    byCategory.set(row.categoryId, entry);
  }

  return { totals, byCategory: [...byCategory.values()] };
}

export async function assetDetail(id: string, asOf: Date) {
  const asset = await db.asset.findUnique({
    where: { id },
    include: {
      category: true,
      location: true,
      custodian: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
      vendor: { select: { id: true, name: true } },
      expense: { select: { id: true, reference: true, description: true, incurredOn: true } },
      photo: { select: { id: true } },
      events: {
        orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
        take: 100,
        include: {
          fromLocation: { select: { name: true } },
          toLocation: { select: { name: true } },
          fromStaff: { select: { firstName: true, lastName: true } },
          toStaff: { select: { firstName: true, lastName: true } },
        },
      },
      maintenance: {
        orderBy: { performedOn: "desc" },
        take: 50,
        include: { vendor: { select: { name: true } } },
      },
    },
  });

  if (!asset) return null;

  const life = asset.usefulLifeYears ?? asset.category.usefulLifeYears ?? null;
  const depreciable = {
    costMinor: asset.costMinor,
    residualMinor: asset.residualMinor,
    usefulLifeYears: life,
    purchasedOn: asset.purchasedOn,
    disposedOn: asset.disposedOn,
  };

  return {
    asset,
    life,
    value: depreciate(depreciable, asOf),
    service: serviceState(
      {
        serviceIntervalMonths: asset.serviceIntervalMonths,
        lastServicedOn: asset.lastServicedOn,
        purchasedOn: asset.purchasedOn,
        status: asset.status as AssetStatus,
      },
      asOf,
    ),
    verified: verificationState(asset.lastVerifiedOn, asOf),
  };
}

/**
 * The next tag in a category.
 *
 * Derived from the highest number already issued in that category rather than
 * from a count, because a count reuses the tag of anything deleted — and two
 * things in a store room wearing the same sticker is the one failure a
 * stock-take cannot recover from.
 */
export async function nextAssetTag(categoryId: string, prefix: string): Promise<string> {
  const category = await db.assetCategory.findUnique({
    where: { id: categoryId },
    select: { code: true },
  });

  const existing = await db.asset.findMany({
    where: { categoryId },
    select: { tag: true },
    take: 5_000,
  });

  const highest = existing.reduce((max, row) => {
    const sequence = tagSequence(row.tag);
    return sequence !== null && sequence > max ? sequence : max;
  }, 0);

  return assetTag(prefix, category?.code, highest + 1);
}

export async function assetPickLists() {
  const [categories, locations, staff, vendors] = await Promise.all([
    db.assetCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true, usefulLifeYears: true, residualPercent: true },
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

/**
 * Capital bills with nothing recorded against them.
 *
 * The loop this module was built to close, made visible: a school that
 * approved GH₵40,000 for equipment and entered no equipment is looking at the
 * difference between its accounts and its property.
 */
export async function capitalSpendWithoutAssets(limit = 25) {
  return db.expense.findMany({
    where: {
      category: { kind: "CAPITAL" },
      status: { in: ["APPROVED", "PAID"] },
      assets: { none: {} },
    },
    orderBy: { incurredOn: "desc" },
    take: limit,
    select: {
      id: true,
      reference: true,
      description: true,
      amountMinor: true,
      incurredOn: true,
      vendor: { select: { name: true } },
    },
  });
}
