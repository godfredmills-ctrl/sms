import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

import { StockCategoryForm } from "../store-forms";

export const metadata: Metadata = { title: "Stock categories" };
export const dynamic = "force-dynamic";

export default async function StockCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  await requirePermission("stock.manage");

  const [categories, { first }] = await Promise.all([
    db.stockCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { items: true } } },
    }),
    searchParams,
  ]);

  return (
    <>
      <Link
        href="/stores"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-4" />
        Back to the store
      </Link>

      <PageHeader
        title="Stock categories"
        description="How the store is grouped, and what each item's code begins with."
      />

      {first ? (
        <Alert tone="info" className="mb-4">
          Set up a category or two before adding anything. Most schools start with
          stationery, provisions, cleaning materials, and medical supplies.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {categories.map((category) => (
            <Card key={category.id}>
              <CardHeader
                title={category.name}
                action={
                  <span className="flex items-center gap-1.5">
                    {category.code ? <Badge tone="neutral">{category.code}</Badge> : null}
                    <Badge tone={category.active ? "success" : "neutral"}>
                      {category._count.items} item
                      {category._count.items === 1 ? "" : "s"}
                    </Badge>
                  </span>
                }
              />
              <CardBody>
                <StockCategoryForm
                  values={{
                    id: category.id,
                    name: category.name,
                    code: category.code,
                    sortOrder: category.sortOrder,
                    active: category.active,
                    notes: category.notes,
                  }}
                />
              </CardBody>
            </Card>
          ))}

          {!categories.length ? (
            <Card>
              <CardBody>
                <p className="text-sm text-[var(--text-muted)]">
                  No categories yet. Add the first one on the right.
                </p>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader
            title="Add a category"
            description="A category cannot be deleted once items are filed under it — turn it off instead, and what is already there keeps its history."
          />
          <CardBody>
            <StockCategoryForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
