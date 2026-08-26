import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { stockPickLists } from "@/lib/stock";

import { ItemForm } from "../store-forms";

export const metadata: Metadata = { title: "Add a stock item" };
export const dynamic = "force-dynamic";

export default async function NewStockItemPage() {
  await requirePermission("stock.manage");

  const lists = await stockPickLists();

  // A form whose only required dropdown is empty is a dead end. Send them to
  // the thing they have to do first.
  if (!lists.categories.length) redirect("/stores/categories?first=1");

  return (
    <>
      <PageHeader
        title="Add a stock item"
        description="Something the store keeps a quantity of. The code is issued automatically."
      />

      <Card>
        <CardHeader
          title="Details"
          description="Nothing is on the shelf until a delivery or an opening balance is recorded against it: the balance is the sum of the movements."
        />
        <ItemForm lists={lists} />
      </Card>
    </>
  );
}
