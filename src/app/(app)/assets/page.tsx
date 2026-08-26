import type { Metadata } from "next";
import Link from "next/link";
import {
  Boxes,
  FileDown,
  Landmark,
  MapPin,
  Plus,
  ScanLine,
  Tags,
  TriangleAlert,
  Wrench,
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
import {
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  conditionLabel,
  statusLabel,
} from "@/lib/asset-rules";
import { assetPickLists, capitalSpendWithoutAssets, register, registerSummary } from "@/lib/assets";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Asset Register" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("asset.read");

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);

  const filter = {
    search: String(params.q ?? "").trim() || undefined,
    categoryId: String(params.category ?? "") || undefined,
    locationId: String(params.location ?? "") || undefined,
    status: String(params.status ?? "") || undefined,
    condition: String(params.condition ?? "") || undefined,
    needsAttention: params.attention === "1",
  };

  const asOf = new Date();

  const [{ rows, total }, summary, lists, unrecordedCapital] = await Promise.all([
    register(filter, asOf, { take, skip }),
    registerSummary(filter, asOf),
    assetPickLists(),
    userCan(user, "finance.expense.read")
      ? capitalSpendWithoutAssets(5)
      : Promise.resolve([]),
  ]);

  const mayManage = userCan(user, "asset.manage");
  const { totals } = summary;

  const attention = rows.filter(
    (row) => row.serviceOverdue || row.neverVerified || row.status === "MISSING",
  ).length;

  const query = (extra: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({
      q: filter.search,
      category: filter.categoryId,
      location: filter.locationId,
      status: filter.status,
      condition: filter.condition,
      attention: filter.needsAttention ? "1" : undefined,
      ...extra,
    })) {
      if (value) next.set(key, value);
    }
    const text = next.toString();
    return text ? `/assets?${text}` : "/assets";
  };

  return (
    <>
      <PageHeader
        title="Asset register"
        description="What the school owns, where it is, who has it, and what it is still worth."
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/api/assets/register" variant="secondary" size="sm">
              <FileDown className="size-4" />
              Print the register
            </LinkButton>
            {mayManage ? (
              <>
                <LinkButton href="/assets/categories" variant="secondary" size="sm">
                  <Tags className="size-4" />
                  Categories
                </LinkButton>
                <LinkButton href="/assets/locations" variant="secondary" size="sm">
                  <MapPin className="size-4" />
                  Locations
                </LinkButton>
                <LinkButton href="/assets/new" size="sm">
                  <Plus className="size-4" />
                  Add an asset
                </LinkButton>
              </>
            ) : null}
          </div>
        }
      />

      {!lists.categories.length ? (
        <Alert tone="info" className="mb-4">
          There are no asset categories yet, and every asset needs one: the
          category decides how a thing loses value.{" "}
          {mayManage ? (
            <Link href="/assets/categories" className="font-medium underline">
              Set the categories up first
            </Link>
          ) : (
            "Ask an administrator to set them up."
          )}
          .
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Held"
          value={String(totals.heldCount)}
          hint={totals.disposedCount ? `${totals.disposedCount} disposed of` : "Nothing disposed of"}
          tone="info"
          icon={<Boxes className="size-4" />}
        />
        <StatCard
          label="At cost"
          value={formatMoney(totals.costMinor, "GHS", { compact: true })}
          hint="What the school paid"
          tone="neutral"
          icon={<Landmark className="size-4" />}
        />
        <StatCard
          label="Written down to"
          value={formatMoney(totals.netBookMinor, "GHS", { compact: true })}
          hint={`${formatMoney(totals.accumulatedMinor, "GHS", { compact: true })} depreciated`}
          tone="success"
          icon={<Landmark className="size-4" />}
        />
        <StatCard
          label="Needs attention"
          value={String(attention)}
          hint={totals.missingCount ? `${totals.missingCount} cannot be found` : "On this page"}
          tone={attention ? "warning" : "success"}
          icon={<TriangleAlert className="size-4" />}
        />
      </div>

      {unrecordedCapital.length ? (
        <Alert tone="warning" className="mb-4">
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>
                {unrecordedCapital.length} capital bill
                {unrecordedCapital.length === 1 ? "" : "s"} bought nothing on this
                register.
              </strong>{" "}
              The school approved money for something lasting and no such thing was
              entered: which is the difference between its accounts and its
              property. Most recent:{" "}
              {unrecordedCapital
                .slice(0, 3)
                .map((expense) => `${expense.reference} (${formatMoney(expense.amountMinor)})`)
                .join(", ")}
              .
            </span>
          </span>
        </Alert>
      ) : null}

      <Card className="mb-4">
        <CardBody className="space-y-3">
          <LedgerSearch
            action="/assets"
            defaultValue={filter.search ?? ""}
            placeholder="Tag, name, serial number or model…"
            label="Search the register"
            found={total}
            noun="asset"
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
              Needs attention
            </Link>

            {ASSET_STATUSES.map((status) => (
              <Link
                key={status.value}
                href={query({
                  status: filter.status === status.value ? undefined : status.value,
                })}
                className={`rounded-full border px-2.5 py-1 transition-colors ${
                  filter.status === status.value
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 font-medium"
                    : "border-[var(--border)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                {status.label}
              </Link>
            ))}
          </div>

          {lists.categories.length ? (
            <div className="flex flex-wrap gap-1.5 text-xs">
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
          ) : null}
        </CardBody>
      </Card>

      {summary.byCategory.length > 1 ? (
        <Card className="mb-4">
          <CardHeader
            title="By category"
            description="What is held, at cost and written down, for everything matching these filters."
          />
          <CardBody className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th className="py-1.5 pr-3 font-medium">Category</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Held</th>
                  <th className="py-1.5 pr-3 text-right font-medium">At cost</th>
                  <th className="py-1.5 text-right font-medium">Written down to</th>
                </tr>
              </thead>
              <tbody>
                {summary.byCategory.map((entry) => (
                  <tr key={entry.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-1.5 pr-3">{entry.name}</td>
                    <td className="numeric py-1.5 pr-3 text-right">{entry.count}</td>
                    <td className="numeric py-1.5 pr-3 text-right">
                      {formatMoney(entry.costMinor)}
                    </td>
                    <td className="numeric py-1.5 text-right font-medium">
                      {formatMoney(entry.netBookMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ) : null}

      {rows.length ? (
        <Card>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Tag</th>
                  <th className="px-3 py-2 font-medium">Asset</th>
                  <th className="px-3 py-2 font-medium">Where</th>
                  <th className="px-3 py-2 font-medium">Who</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Now worth</th>
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
                        href={`/assets/${row.id}`}
                        className="numeric font-medium text-[var(--primary)] hover:underline"
                      >
                        {row.tag}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        {row.categoryName}
                        {row.serialNumber ? ` · ${row.serialNumber}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      {row.locationName ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      {row.custodianName ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap items-center gap-1">
                        <Badge
                          tone={
                            row.status === "MISSING"
                              ? "danger"
                              : row.status === "IN_USE" || row.status === "IN_STORE"
                                ? "success"
                                : "neutral"
                          }
                        >
                          {statusLabel(row.status)}
                        </Badge>
                        {row.serviceOverdue ? (
                          <Badge tone="warning">
                            <Wrench className="size-2.5" />
                            Service due
                          </Badge>
                        ) : null}
                        {row.neverVerified && row.status !== "DISPOSED" ? (
                          <Badge tone="warning">
                            <ScanLine className="size-2.5" />
                            Never seen
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--text-subtle)]">
                        {conditionLabel(row.condition)}
                        {row.purchasedOn ? ` · bought ${formatDate(row.purchasedOn)}` : ""}
                      </span>
                    </td>
                    <td className="numeric px-3 py-2 text-right">
                      {formatMoney(row.costMinor)}
                    </td>
                    <td className="numeric px-3 py-2 text-right font-medium">
                      {row.status === "DISPOSED" ? (
                        <span className="text-[var(--text-subtle)]">disposed</span>
                      ) : row.notDepreciated ? (
                        <span title="Not depreciated: carried at cost">
                          {formatMoney(row.netBookMinor)}
                        </span>
                      ) : (
                        formatMoney(row.netBookMinor)
                      )}
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
            filter.search || filter.status || filter.categoryId || filter.needsAttention
              ? "Nothing matches those filters"
              : "Nothing is on the register yet"
          }
          description={
            filter.search || filter.status || filter.categoryId || filter.needsAttention
              ? "Clear the filters to see everything the school owns."
              : "Add the things the school owns: the buses, the generator, the laptops, the laboratory equipment: and the register will value them and tell you when they are due for service."
          }
        />
      )}

      <Pager
        basePath="/assets"
        searchParams={params}
        page={page}
        perPage={PER_PAGE}
        total={total}
        label="assets"
      />

      {ASSET_CONDITIONS.length && rows.length ? (
        <p className="mt-4 text-xs text-[var(--text-subtle)]">
          Values are straight-line, charged monthly from the date of purchase and
          never taken below the residual value. Anything with no useful life set is
          carried at cost.
        </p>
      ) : null}
    </>
  );
}
