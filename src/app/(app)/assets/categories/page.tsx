import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

import { CategoryForm } from "./setup-forms";

export const metadata: Metadata = { title: "Asset categories" };
export const dynamic = "force-dynamic";

export default async function AssetCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string }>;
}) {
  await requirePermission("asset.manage");

  const [categories, { first }] = await Promise.all([
    db.assetCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { assets: true } } },
    }),
    searchParams,
  ]);

  return (
    <>
      <Link
        href="/assets"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-4" />
        Back to the register
      </Link>

      <PageHeader
        title="Asset categories"
        description="What kind of thing it is, and how that kind loses its value."
      />

      {first ? (
        <Alert tone="info" className="mb-4">
          Set up a category or two before adding anything — every asset needs one,
          and the category decides how the register values it. Most schools start
          with vehicles, ICT equipment, furniture, laboratory equipment and
          buildings.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {categories.map((category) => (
            <Card key={category.id}>
              <CardHeader
                title={category.name}
                description={
                  category.usefulLifeYears
                    ? `Written off over ${category.usefulLifeYears} year${category.usefulLifeYears === 1 ? "" : "s"}${category.residualPercent ? `, keeping ${category.residualPercent}%` : ""}`
                    : "Carried at cost — not depreciated"
                }
                action={
                  <span className="flex items-center gap-1.5">
                    {category.code ? <Badge tone="neutral">{category.code}</Badge> : null}
                    <Badge tone={category.active ? "success" : "neutral"}>
                      {category._count.assets} asset
                      {category._count.assets === 1 ? "" : "s"}
                    </Badge>
                  </span>
                }
              />
              <CardBody>
                <CategoryForm
                  values={{
                    id: category.id,
                    name: category.name,
                    code: category.code,
                    usefulLifeYears: category.usefulLifeYears,
                    residualPercent: category.residualPercent,
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
            description="A category cannot be deleted once anything is filed under it — turn it off instead, and what is already there keeps its valuation."
          />
          <CardBody>
            <CategoryForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
