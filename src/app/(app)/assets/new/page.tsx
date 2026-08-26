import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Alert, Card, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { assetPickLists } from "@/lib/assets";
import { db } from "@/lib/db";

import { AssetForm } from "../asset-form";

export const metadata: Metadata = { title: "Add an asset" };
export const dynamic = "force-dynamic";

export default async function NewAssetPage({
  searchParams,
}: {
  searchParams: Promise<{ expense?: string }>;
}) {
  await requirePermission("asset.manage");

  const [lists, { expense }] = await Promise.all([assetPickLists(), searchParams]);

  // Nothing can be added before there is a category to file it under, and a
  // form with an empty required dropdown is a dead end. Say where to go.
  if (!lists.categories.length) redirect("/assets/categories?first=1");

  // Capital bills, so the thing can be tied to the money that bought it as it
  // is entered rather than in a second pass nobody makes.
  const capitalExpenses = await db.expense.findMany({
    where: {
      category: { kind: "CAPITAL" },
      status: { in: ["APPROVED", "PAID"] },
    },
    orderBy: { incurredOn: "desc" },
    take: 100,
    select: { id: true, reference: true, description: true },
  });

  const fromExpense = expense
    ? capitalExpenses.find((entry) => entry.id === expense)
    : undefined;

  return (
    <>
      <PageHeader
        title="Add an asset"
        description="One thing the school owns. It gets a tag of its own, so thirty identical chairs are thirty entries."
      />

      {fromExpense ? (
        <Alert tone="info" className="mb-4">
          Recording what <strong>{fromExpense.reference}</strong> bought:{" "}
          {fromExpense.description}. Enter each thing separately if the bill
          covered more than one.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Details"
          description="The tag is issued automatically from the category: nobody has to invent one."
        />
        <AssetForm
          lists={lists}
          capitalExpenses={capitalExpenses}
          values={fromExpense ? { expenseId: fromExpense.id } : {}}
        />
      </Card>
    </>
  );
}
