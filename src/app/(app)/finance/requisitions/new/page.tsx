import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

import { RequisitionForm } from "../requisition-forms";

export const metadata: Metadata = { title: "Raise a requisition" };
export const dynamic = "force-dynamic";

export default async function NewRequisitionPage() {
  await requirePermission("finance.requisition.request");

  const [categories, stockItems] = await Promise.all([
    db.expenseCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true },
    }),
    db.stockItem.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, unit: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Raise a requisition"
        description="Ask before it is bought. Saved as a draft until you send it."
        breadcrumb={
          <Link href="/finance/requisitions" className="hover:text-[var(--text)]">
            Requisitions
          </Link>
        }
      />

      <RequisitionForm
        id={null}
        categories={categories.map((category) => ({
          value: category.id,
          label: category.name,
          description: category.code ?? undefined,
        }))}
        stockItems={stockItems.map((item) => ({
          value: item.id,
          label: item.name,
          description: item.unit ?? undefined,
        }))}
        values={{
          title: "",
          categoryId: "",
          department: "",
          justification: "",
          neededBy: "",
          lines: [],
        }}
      />
    </>
  );
}
