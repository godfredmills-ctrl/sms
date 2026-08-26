import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { COMMITTED } from "@/lib/expenses";

import { VendorEditor, type CategoryRow, type VendorRow } from "./vendor-editor";

export const metadata: Metadata = { title: "Vendors & categories" };
export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const user = await requirePermission("finance.expense.read");

  const [categories, vendors] = await Promise.all([
    db.expenseCategory.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        kind: true,
        sortOrder: true,
        notes: true,
        active: true,
        expenses: {
          where: { status: { in: COMMITTED } },
          select: { amountMinor: true },
        },
      },
    }),
    db.vendor.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: 1000,
      select: {
        id: true,
        name: true,
        supplies: true,
        contactName: true,
        phone: true,
        email: true,
        address: true,
        tin: true,
        bankName: true,
        bankAccount: true,
        momoNumber: true,
        notes: true,
        active: true,
        expenses: {
          where: { status: { in: COMMITTED } },
          select: { amountMinor: true },
        },
      },
    }),
  ]);

  const totalled = <T extends { expenses: { amountMinor: number }[] }>(row: T) => ({
    bills: row.expenses.length,
    spentMinor: row.expenses.reduce((sum, expense) => sum + expense.amountMinor, 0),
  });

  const categoryRows: CategoryRow[] = categories.map(({ expenses, ...category }) => ({
    ...category,
    ...totalled({ expenses }),
  }));

  const vendorRows: VendorRow[] = vendors.map(({ expenses, ...vendor }) => ({
    ...vendor,
    ...totalled({ expenses }),
  }));

  return (
    <>
      <PageHeader
        title="Vendors &amp; categories"
        description="What a bill can be called, and who it can be to. Neither is ever deleted: a category names last term's spending, and a vendor is who the school paid."
      />
      <VendorEditor
        vendors={vendorRows}
        categories={categoryRows}
        canManage={userCan(user, "finance.vendor.manage")}
      />
    </>
  );
}
