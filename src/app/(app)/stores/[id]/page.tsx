import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarX, TriangleAlert } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { itemDetail, stockPickLists } from "@/lib/stock";
import { expiryState, formatQuantity, formatUnits, movementLabel } from "@/lib/stock-rules";
import { formatDate } from "@/lib/utils";

import { CountForm, IssueForm, ReceiveForm } from "../store-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await itemDetail(id);
  return { title: detail ? `${detail.item.code}, ${detail.item.name}` : "Stock item" };
}

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

export default async function StockItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("stock.read");
  const { id } = await params;

  const [detail, lists] = await Promise.all([itemDetail(id), stockPickLists()]);
  if (!detail) notFound();

  const { item, state, balances, level, suggestedOrderMilli } = detail;
  const asOf = new Date();

  const mayReceive = userCan(user, "stock.receive");
  const mayIssue = userCan(user, "stock.issue");
  const mayAdjust = userCan(user, "stock.adjust");
  const mayManage = userCan(user, "stock.manage");

  const onHand = formatUnits(state.quantityMilli, item.unit);
  const expiry = expiryState(item.expiresOn, asOf);

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
        title={item.name}
        description={`${item.code} · ${item.category.name}`}
        action={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={LEVEL_TONE[level]}>{LEVEL_LABEL[level]}</Badge>
            {!item.active ? <Badge tone="neutral">Retired</Badge> : null}
          </span>
        }
      />

      {state.oversold > 0 ? (
        <Alert tone="danger" className="mb-4">
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>
                {state.oversold} movement{state.oversold === 1 ? "" : "s"} in this
                history would have taken the shelf below zero.
              </strong>{" "}
              The balance is held at what could actually have been there, so it is
              not negative: but something was issued that the book says was never
              received. Count it and record the count.
            </span>
          </span>
        </Alert>
      ) : null}


      {state.quantityMilli > 0 && expiry === "expired" ? (
        <Alert tone="danger" className="mb-4">
          <span className="flex items-start gap-2">
            <CalendarX className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>This went out of date on {formatDate(item.expiresOn!, "long")}.</strong>{" "}
              There {state.quantityMilli === 1000 ? "is" : "are"} still {onHand} on the
              shelf. Write it off rather than issuing it.
            </span>
          </span>
        </Alert>
      ) : state.quantityMilli > 0 && expiry === "soon" ? (
        <Alert tone="warning" className="mb-4">
          Best before {formatDate(item.expiresOn!, "long")}: use it before then.
        </Alert>
      ) : null}

      {suggestedOrderMilli > 0 ? (
        <Alert tone="warning" className="mb-4">
          Order about {formatUnits(suggestedOrderMilli, item.unit)} to bring this
          back up.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Movements"
              description="Append-only. A correction is another movement, never an edit: the balance is the sum of these."
              action={
                mayManage ? (
                  <Link
                    href={`/stores/${item.id}/edit`}
                    className="text-sm font-medium text-[var(--primary)] hover:underline"
                  >
                    Edit the item
                  </Link>
                ) : null
              }
            />
            <CardBody className="overflow-x-auto p-0">
              {item.movements.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">What</th>
                      <th className="px-3 py-2 text-right font-medium">Quantity</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                      <th className="px-3 py-2 font-medium">Who / why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.movements.map((movement) => {
                      const after = balances.get(movement.id);
                      const inward = ["OPENING", "RECEIPT", "RETURN", "ADJUSTMENT_UP"].includes(
                        movement.kind,
                      );
                      return (
                        <tr
                          key={movement.id}
                          className="border-b border-[var(--border)] last:border-0"
                        >
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {formatDate(movement.occurredOn)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs font-medium">
                              {movementLabel(movement.kind)}
                            </span>
                            {movement.reference ? (
                              // Only an issue produces a voucher. A delivery
                              // note number is the supplier's paper, not ours,
                              // and linking it to a slip that does not exist
                              // would be a button that 404s.
                              movement.kind === "ISSUE" ? (
                                <a
                                  href={`/api/stores/voucher/${encodeURIComponent(movement.reference)}`}
                                  className="numeric block text-xs text-[var(--primary)] hover:underline"
                                >
                                  {movement.reference}
                                </a>
                              ) : (
                                <span className="numeric block text-xs text-[var(--text-subtle)]">
                                  {movement.reference}
                                </span>
                              )
                            ) : null}
                          </td>
                          <td
                            className={`numeric px-3 py-2 text-right font-medium ${
                              inward ? "text-[var(--success)]" : "text-[var(--text)]"
                            }`}
                          >
                            {inward ? "+" : "−"}
                            {formatQuantity(Math.round(Number(movement.quantity) * 1000))}
                          </td>
                          <td className="numeric px-3 py-2 text-right text-xs text-[var(--text-muted)]">
                            {after ? formatQuantity(after.quantityMilli) : "-"}
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                            {movement.issuedTo
                              ? `${movement.issuedTo.firstName} ${movement.issuedTo.lastName}`
                              : movement.vendor?.name ?? ""}
                            {movement.issuedToDept ? ` · ${movement.issuedToDept}` : ""}
                            {movement.note ? (
                              <span className="block">{movement.note}</span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <EmptyState
                  title="Nothing has moved yet"
                  description="Record what is already on the shelf as an opening balance, or the first delivery."
                />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="On the shelf" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "On hand", value: onHand },
                  {
                    label: "Average cost",
                    value:
                      state.averageCostMinor === null
                        ? "-"
                        : `${formatMoney(state.averageCostMinor)} per ${item.unit}`,
                  },
                  { label: "Value", value: formatMoney(state.valueMinor) },
                  {
                    label: "Reorder at",
                    value:
                      item.reorderLevel === null
                        ? "Not set: nothing will flag it"
                        : `${formatQuantity(Math.round(Number(item.reorderLevel) * 1000))} ${item.unit}`,
                  },
                  {
                    label: "Kept in",
                    value: item.location
                      ? [item.location.name, item.location.building].filter(Boolean).join(" · ")
                      : "Not recorded",
                  },
                  {
                    label: "Best before",
                    value: item.expiresOn ? formatDate(item.expiresOn) : "-",
                  },
                ]}
              />
              {item.notes ? (
                <p className="mt-3 rounded-lg bg-[var(--bg-subtle)] p-2.5 text-xs text-[var(--text-muted)]">
                  {item.notes}
                </p>
              ) : null}
            </CardBody>
          </Card>

          {mayReceive ? (
            <Card>
              <CardHeader title="Record a delivery" />
              <CardBody>
                <ReceiveForm
                  itemId={item.id}
                  unit={item.unit}
                  perishable={item.perishable}
                  vendors={lists.vendors}
                />
              </CardBody>
            </Card>
          ) : null}

          {mayIssue ? (
            <Card>
              <CardHeader title="Issue it out" />
              <CardBody>
                <IssueForm
                  itemId={item.id}
                  unit={item.unit}
                  onHand={onHand}
                  staff={lists.staff}
                />
              </CardBody>
            </Card>
          ) : null}

          {mayAdjust ? (
            <Card>
              <CardHeader
                title="Record a count"
                description="What was actually on the shelf."
              />
              <CardBody>
                <CountForm itemId={item.id} unit={item.unit} onHand={onHand} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
