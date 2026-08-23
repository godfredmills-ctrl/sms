import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { assetPickLists } from "@/lib/assets";
import { db } from "@/lib/db";

import { AssetForm } from "../../asset-form";

export const metadata: Metadata = { title: "Edit asset" };
export const dynamic = "force-dynamic";

/** The form's date inputs want YYYY-MM-DD, and nothing else. */
function forInput(date: Date | null): string | undefined {
  return date ? date.toISOString().slice(0, 10) : undefined;
}

/** Minor units back to the plain decimal a person types. */
function forMoney(minor: number): string | undefined {
  return minor ? (minor / 100).toFixed(2) : undefined;
}

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("asset.manage");
  const { id } = await params;

  const [asset, lists, capitalExpenses] = await Promise.all([
    db.asset.findUnique({ where: { id } }),
    assetPickLists(),
    db.expense.findMany({
      where: { category: { kind: "CAPITAL" }, status: { in: ["APPROVED", "PAID"] } },
      orderBy: { incurredOn: "desc" },
      take: 100,
      select: { id: true, reference: true, description: true },
    }),
  ]);

  if (!asset) notFound();

  return (
    <>
      <Link
        href={`/assets/${asset.id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-4" />
        Back to {asset.tag}
      </Link>

      <PageHeader title={`Edit ${asset.name}`} description={asset.tag} />

      <Card>
        <CardHeader
          title="Details"
          description="Moving it or changing who holds it here is recorded in the history, the same as doing it from the asset's own page."
        />
        <AssetForm
          lists={lists}
          capitalExpenses={capitalExpenses}
          values={{
            id: asset.id,
            name: asset.name,
            description: asset.description,
            categoryId: asset.categoryId,
            serialNumber: asset.serialNumber,
            model: asset.model,
            manufacturer: asset.manufacturer,
            condition: asset.condition,
            locationId: asset.locationId,
            custodianId: asset.custodianId,
            purchasedOn: forInput(asset.purchasedOn),
            cost: forMoney(asset.costMinor),
            residual: forMoney(asset.residualMinor),
            usefulLifeYears:
              asset.usefulLifeYears === null ? undefined : String(asset.usefulLifeYears),
            vendorId: asset.vendorId,
            expenseId: asset.expenseId,
            warrantyExpiresOn: forInput(asset.warrantyExpiresOn),
            serviceIntervalMonths:
              asset.serviceIntervalMonths === null
                ? undefined
                : String(asset.serviceIntervalMonths),
            lastServicedOn: forInput(asset.lastServicedOn),
            notes: asset.notes,
          }}
        />
      </Card>
    </>
  );
}
