import type { Metadata } from "next";
import Link from "next/link";
import {
  Boxes,
  CalendarX,
  PackageX,
  Plus,
  Tags,
  TrendingDown,
  TriangleAlert,
} from "lucide-react";

import { LedgerSearch } from "@/components/ledger-search";
import { Pager, pageOf } from "@/components/pager";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { storeListing, storeSummary, stockPickLists } from "@/lib/stock";
import { formatQuantity } from "@/lib/stock-rules";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "School Store" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

const LEVEL_TONE = {
  OUT: "danger",
  LOW: "warning",
  OK: "success",
  UNTRACKED: "neutral",
} as const;

const LEVEL_LABEL = {
  OUT: "Out of stock",
  LOW: "Running low",
  OK: "In stock",
  UNTRACKED: "No reorder level",
} as const;

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("stock.read");

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);

  const filter = {
    search: String(params.q ?? "").trim() || undefined,
    categoryId: String(params.category ?? "") || undefined,
    needsAttention: params.attention === "1",
  };

  const asOf = new Date();

  const [{ rows, total }, summary, lists] = await Promise.all([
    storeListing(filter, asOf, { take, skip }),
    storeSummary(filter, asOf),
    stockPickLists(),
  ]);

  const mayManage = userCan(user, "stock.manage");
  const { totals } = summary;

  const query = (extra: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({
      q: filter.search,
      category: filter.categoryId,
      attention: filter.needsAttention ? "1" : undefined,
      ...extra,
    })) {
      if (value) next.set(key, value);
    }
    const text = next.toString();
    return text ? `/stores?${text}` : "/stores";
  };

  return (
    <>
      <PageHeader
        title="School store"
        description="What is on the shelf, what it is worth, and what needs buying."
        action={
          mayManage ? (
            <div className="flex flex-wrap gap-2">
              <LinkButton href="/stores/categories" variant="secondary" size="sm">
                <Tags className="size-4" />
                Categories
              </LinkButton>
              <LinkButton href="/stores/new" size="sm">
                <Plus className="size-4" />
                Add an item
              </LinkButton>
            </div>
          ) : null
        }
      />

      {!lists.categories.length ? (
        <Alert tone="info" className="mb-4">
          There are no stock categories yet, and every item needs one.{" "}
          {mayManage ? (
            <Link href="/stores/categories" className="font-medium underline">
              Set them up first
            </Link>
          ) : (
            "Ask an administrator to set them up."
          )}
          .
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="On the shelf"
          value={formatMoney(totals.valueMinor, "GHS", { compact: true })}
          hint={`${totals.items} item${totals.items === 1 ? "" : "s"}`}
          tone="info"
          icon={<Boxes className="size-4" />}
        />
        <StatCard
          label="Out of stock"
          value={String(totals.outOfStock)}
          hint={totals.outOfStock ? "Nothing left to issue" : "Nothing has run out"}
          tone={totals.outOfStock ? "danger" : "success"}
          icon={<PackageX className="size-4" />}
        />
        <StatCard
          label="Running low"
          value={String(totals.low)}
          hint="At or below the reorder level"
          tone={totals.low ? "warning" : "success"}
          icon={<TrendingDown className="size-4" />}
        />
        <StatCard
          label="Expired"
          value={String(totals.expired)}
          hint={
            totals.expiringSoon ? `${totals.expiringSoon} expiring soon` : "Nothing out of date"
          }
          tone={totals.expired ? "danger" : "success"}
          icon={<CalendarX className="size-4" />}
        />
      </div>

      {totals.untracked ? (
        <Alert tone="info" className="mb-4">
          {totals.untracked} item{totals.untracked === 1 ? " has" : "s have"} no reorder
          level set, so nothing will ever say they are running low. An item with no
          level is untracked rather than comfortable.
        </Alert>
      ) : null}

      <Card className="mb-4">
        <CardBody className="space-y-3">
          <LedgerSearch
            action="/stores"
            defaultValue={filter.search ?? ""}
            placeholder="Code, name or description…"
            label="Search the store"
            found={total}
            noun="item"
          />

          <div className="flex flex-wrap gap-1.5 text-xs">
            <Link
              href={query({ attention: filter.needsAttention ? undefined : "1" })}
              className={`rounded-full border px-2.5 py-1 transition-colors ${
                filter.needsAttention
                  ? "border-[var(--warning)] bg-[var(--warning)]/10 font-medium"
                  : "border-[var(--border)] hover:bg-[var(--bg-subtle)]"
              }`}
            >
              Needs buying
            </Link>
            {lists.categories.map((category) => (
              <Link
                key={category.id}
                href={query({
                  category: filter.categoryId === category.id ? undefined : category.id,
                })}
                className={`rounded-full border px-2.5 py-1 transition-colors ${
                  filter.categoryId === category.id
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 font-medium"
                    : "border-[var(--border)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                {category.name}
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>

      {rows.length ? (
        <Card>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Where</th>
                  <th className="px-3 py-2 text-right font-medium">On hand</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 text-right font-medium">Avg cost</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-subtle)]"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/stores/${row.id}`}
                        className="numeric font-medium text-[var(--primary)] hover:underline"
                      >
                        {row.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        {row.categoryName}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      {row.locationName ?? "-"}
                    </td>
                    <td className="numeric px-3 py-2 text-right font-medium">
                      {row.quantityLabel}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap items-center gap-1">
                        <Badge tone={LEVEL_TONE[row.level]}>{LEVEL_LABEL[row.level]}</Badge>
                        {row.quantityMilli > 0 && row.expiresOn && row.expiresOn < asOf ? (
                          <Badge tone="danger">
                            <CalendarX className="size-2.5" />
                            Expired
                          </Badge>
                        ) : null}
                      </span>
                      {row.suggestedOrderMilli > 0 ? (
                        <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">
                          order {formatQuantity(row.suggestedOrderMilli)} {row.unit}
                        </span>
                      ) : row.lastMovedOn ? (
                        <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">
                          last moved {formatDate(row.lastMovedOn)}
                        </span>
                      ) : null}
                    </td>
                    <td className="numeric px-3 py-2 text-right text-xs text-[var(--text-muted)]">
                      {row.averageCostMinor === null ? "-" : formatMoney(row.averageCostMinor)}
                    </td>
                    <td className="numeric px-3 py-2 text-right font-medium">
                      {formatMoney(row.valueMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ) : (
        <EmptyState
          title={
            filter.search || filter.categoryId || filter.needsAttention
              ? "Nothing matches those filters"
              : "The store is empty"
          }
          description={
            filter.search || filter.categoryId || filter.needsAttention
              ? "Clear the filters to see everything the store keeps."
              : "Add what the store keeps: exercise books, chalk, cleaning materials, the provisions the dining hall cooks with: and the store will value them and say when to buy more."
          }
        />
      )}

      <Pager
        basePath="/stores"
        searchParams={params}
        page={page}
        perPage={PER_PAGE}
        total={total}
        label="items"
      />

      {rows.length ? (
        <p className="mt-4 text-xs text-[var(--text-subtle)]">
          Stock is valued at weighted average cost: every delivery moves the average,
          and anything issued leaves at it. The balance is the sum of the movements:
          there is no separate quantity to disagree with them.
        </p>
      ) : null}
    </>
  );
}
