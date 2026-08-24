import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { stockPickLists } from "@/lib/stock";

import { ItemForm } from "../../store-forms";

export const metadata: Metadata = { title: "Edit stock item" };
export const dynamic = "force-dynamic";

function forInput(date: Date | null): string | undefined {
  return date ? date.toISOString().slice(0, 10) : undefined;
}

/** A Decimal back to the plain number somebody types. */
function forQuantity(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : undefined;
}

export default async function EditStockItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("stock.manage");
  const { id } = await params;

  const [item, lists] = await Promise.all([
    db.stockItem.findUnique({ where: { id } }),
    stockPickLists(),
  ]);

  if (!item) notFound();

  return (
    <>
      <Link
        href={`/stores/${item.id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-4" />
        Back to {item.code}
      </Link>

      <PageHeader title={`Edit ${item.name}`} description={item.code} />

      <Card>
        <CardHeader
          title="Details"
          description="Editing an item never changes what is on the shelf — that is the sum of its movements, and only a movement can change it."
        />
        <ItemForm
          lists={lists}
          values={{
            id: item.id,
            name: item.name,
            description: item.description,
            categoryId: item.categoryId,
            unit: item.unit,
            reorderLevel: forQuantity(item.reorderLevel),
            reorderQuantity: forQuantity(item.reorderQuantity),
            locationId: item.locationId,
            perishable: item.perishable,
            expiresOn: forInput(item.expiresOn),
            active: item.active,
            notes: item.notes,
          }}
        />
      </Card>
    </>
  );
}
