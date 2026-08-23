import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Receipt, ScanLine, TriangleAlert, Wrench } from "lucide-react";

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
import {
  conditionLabel,
  disposalResult,
  statusLabel,
  warrantyState,
} from "@/lib/asset-rules";
import { assetDetail, assetPickLists } from "@/lib/assets";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

import { MovePanel, ServicePanel, StatusPanel, VerifyPanel } from "./panels";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await assetDetail(id, new Date());
  return { title: detail ? `${detail.asset.tag} — ${detail.asset.name}` : "Asset" };
}

const EVENT_WORDS: Record<string, string> = {
  ACQUIRED: "Entered on the register",
  MOVED: "Moved",
  ASSIGNED: "Signed out",
  RETURNED: "Returned",
  VERIFIED: "Checked",
  CONDITION_CHANGED: "Condition changed",
  STATUS_CHANGED: "Status changed",
  SERVICED: "Serviced",
  DISPOSED: "Disposed of",
};

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("asset.read");
  const { id } = await params;

  const asOf = new Date();
  const [detail, lists] = await Promise.all([assetDetail(id, asOf), assetPickLists()]);
  if (!detail) notFound();

  const { asset, value, service, verified, life } = detail;

  const mayMove = userCan(user, "asset.move");
  const mayVerify = userCan(user, "asset.verify");
  const mayMaintain = userCan(user, "asset.maintain");
  const mayDispose = userCan(user, "asset.dispose");
  const mayManage = userCan(user, "asset.manage");

  const warranty = warrantyState(asset.warrantyExpiresOn, asOf);
  const disposal = disposalResult({
    costMinor: asset.costMinor,
    residualMinor: asset.residualMinor,
    usefulLifeYears: life,
    purchasedOn: asset.purchasedOn,
    disposedOn: asset.disposedOn,
    disposalProceedsMinor: asset.disposalProceedsMinor,
  });

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
        title={asset.name}
        description={`${asset.tag} · ${asset.category.name}`}
        action={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge
              tone={
                asset.status === "MISSING"
                  ? "danger"
                  : asset.status === "IN_USE" || asset.status === "IN_STORE"
                    ? "success"
                    : "neutral"
              }
            >
              {statusLabel(asset.status)}
            </Badge>
            <Badge tone="neutral">{conditionLabel(asset.condition)}</Badge>
          </span>
        }
      />

      {asset.status === "MISSING" ? (
        <Alert tone="danger" className="mb-4">
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>This cannot be found.</strong> It stays on the register at
              its full value until somebody decides to write it off — a thing
              that turns up in a cupboard next term should not have to be entered
              again.
            </span>
          </span>
        </Alert>
      ) : null}

      {service.overdue ? (
        <Alert tone="warning" className="mb-4">
          <span className="flex items-start gap-2">
            <Wrench className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Service overdue.</strong> It was due on{" "}
              {formatDate(service.dueOn!, "long")}
              {asset.lastServicedOn
                ? `, ${asset.serviceIntervalMonths} months after the last one.`
                : " — and it has never been serviced since it was bought."}
            </span>
          </span>
        </Alert>
      ) : null}

      {verified.neverVerified && asset.status !== "DISPOSED" ? (
        <Alert tone="info" className="mb-4">
          <span className="flex items-start gap-2">
            <ScanLine className="mt-0.5 size-4 shrink-0" />
            <span>
              Nobody has confirmed this exists since it was entered. A register
              nobody checks is a list of things the school used to have.
            </span>
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="What it is"
              action={
                mayManage ? (
                  <Link
                    href={`/assets/${asset.id}/edit`}
                    className="text-sm font-medium text-[var(--primary)] hover:underline"
                  >
                    Edit
                  </Link>
                ) : null
              }
            />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Tag", value: asset.tag },
                  { label: "Category", value: asset.category.name },
                  { label: "Make and model", value: [asset.manufacturer, asset.model].filter(Boolean).join(" ") || "—" },
                  { label: "Serial number", value: asset.serialNumber ?? "—" },
                  { label: "Where it is", value: asset.location ? [asset.location.name, asset.location.building, asset.location.room].filter(Boolean).join(" · ") : "Not recorded" },
                  { label: "Who is answerable", value: asset.custodian ? `${asset.custodian.firstName} ${asset.custodian.lastName}${asset.custodian.jobTitle ? ` — ${asset.custodian.jobTitle}` : ""}` : "Nobody in particular" },
                  { label: "Bought from", value: asset.vendor?.name ?? "Not recorded" },
                  {
                    label: "Warranty",
                    value: asset.warrantyExpiresOn
                      ? `${formatDate(asset.warrantyExpiresOn)}${warranty === "expired" ? " — expired" : warranty === "expiring" ? " — expiring soon" : ""}`
                      : "None recorded",
                  },
                  {
                    label: "Last checked",
                    value: asset.lastVerifiedOn
                      ? `${formatDate(asset.lastVerifiedOn)}${verified.stale ? " — a long time ago" : ""}`
                      : "Never",
                  },
                ]}
              />
              {asset.description ? (
                <p className="mt-3 text-sm text-[var(--text-muted)]">{asset.description}</p>
              ) : null}
              {asset.notes ? (
                <p className="mt-2 rounded-lg bg-[var(--bg-subtle)] p-2.5 text-xs text-[var(--text-muted)]">
                  {asset.notes}
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="History"
              description="Where it has been and who has had it. Append-only."
            />
            <CardBody className="p-0">
              {asset.events.length ? (
                <ul className="divide-y divide-[var(--border)]">
                  {asset.events.map((event) => (
                    <li key={event.id} className="px-4 py-2.5 text-sm">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">
                          {EVENT_WORDS[event.kind] ?? event.kind}
                        </span>
                        <span className="text-xs text-[var(--text-subtle)]">
                          {formatDate(event.occurredOn)}
                          {event.recordedByLabel ? ` · ${event.recordedByLabel}` : ""}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                        {event.fromLocation || event.toLocation
                          ? `${event.fromLocation?.name ?? "nowhere recorded"} → ${event.toLocation?.name ?? "nowhere recorded"}. `
                          : ""}
                        {event.fromStaff || event.toStaff
                          ? `${event.fromStaff ? `${event.fromStaff.firstName} ${event.fromStaff.lastName}` : "the school"} → ${event.toStaff ? `${event.toStaff.firstName} ${event.toStaff.lastName}` : "the school"}. `
                          : ""}
                        {event.note ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nothing recorded yet" />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Servicing and repairs" />
            <CardBody className="p-0">
              {asset.maintenance.length ? (
                <ul className="divide-y divide-[var(--border)]">
                  {asset.maintenance.map((entry) => (
                    <li key={entry.id} className="px-4 py-2.5 text-sm">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{entry.description}</span>
                        <span className="numeric text-xs text-[var(--text-subtle)]">
                          {entry.costMinor ? formatMoney(entry.costMinor) : "no cost"}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                        {entry.kind.toLowerCase()} · {formatDate(entry.performedOn)}
                        {entry.vendor ? ` · ${entry.vendor.name}` : ""}
                        {entry.nextDueOn ? ` · next due ${formatDate(entry.nextDueOn)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nothing recorded yet" />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="What it is worth" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Bought on", value: asset.purchasedOn ? formatDate(asset.purchasedOn, "long") : "Not recorded" },
                  { label: "Cost", value: formatMoney(asset.costMinor) },
                  {
                    label: "Written off over",
                    value: life ? `${life} year${life === 1 ? "" : "s"}` : "Not depreciated",
                  },
                  { label: "Worth at the end", value: formatMoney(asset.residualMinor) },
                  { label: "In service for", value: value.notDepreciated ? "—" : `${value.months} months` },
                  { label: "Depreciated so far", value: formatMoney(value.accumulatedMinor) },
                  {
                    label: "Written down to",
                    value: formatMoney(value.netBookMinor),
                  },
                ]}
              />

              {value.notDepreciated ? (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  No useful life is set, so this is carried at cost. That is right
                  for land and for anything the school has chosen not to
                  depreciate; otherwise set a life so the register values it.
                </p>
              ) : (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  Straight line, {formatMoney(value.annualMinor)} a year, charged
                  monthly from the date of purchase and never taken below the
                  residual value.
                </p>
              )}

              {disposal ? (
                <Alert tone={disposal.gainMinor >= 0 ? "success" : "warning"} className="mt-3">
                  Disposed of on {formatDate(asset.disposedOn!, "long")} for{" "}
                  {formatMoney(disposal.proceedsMinor)}, against{" "}
                  {formatMoney(disposal.netBookMinor)} on the books —{" "}
                  <strong>
                    {disposal.gainMinor >= 0 ? "a gain of " : "a loss of "}
                    {formatMoney(Math.abs(disposal.gainMinor))}
                  </strong>
                  .{asset.disposalNote ? ` ${asset.disposalNote}` : ""}
                </Alert>
              ) : null}
            </CardBody>
          </Card>

          {asset.expense ? (
            <Card>
              <CardHeader title="The bill that bought it" />
              <CardBody>
                <Link
                  href={`/finance/expenses`}
                  className="flex items-start gap-2 text-sm text-[var(--primary)] hover:underline"
                >
                  <Receipt className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="numeric font-medium">{asset.expense.reference}</span>
                    <span className="block text-xs text-[var(--text-muted)]">
                      {asset.expense.description} · {formatDate(asset.expense.incurredOn)}
                    </span>
                  </span>
                </Link>
              </CardBody>
            </Card>
          ) : null}

          {mayMove && asset.status !== "DISPOSED" ? (
            <Card>
              <CardHeader title="Move it or sign it out" />
              <CardBody>
                <MovePanel
                  id={asset.id}
                  locations={lists.locations}
                  staff={lists.staff}
                  currentLocationId={asset.locationId}
                  currentCustodianId={asset.custodianId}
                />
              </CardBody>
            </Card>
          ) : null}

          {mayVerify && asset.status !== "DISPOSED" ? (
            <Card>
              <CardHeader
                title="Physical check"
                description="Somebody has walked to where this is meant to be."
              />
              <CardBody>
                <VerifyPanel id={asset.id} condition={asset.condition} />
              </CardBody>
            </Card>
          ) : null}

          {mayMaintain && asset.status !== "DISPOSED" ? (
            <Card>
              <CardHeader title="Record a service or repair" />
              <CardBody>
                <ServicePanel id={asset.id} vendors={lists.vendors} />
              </CardBody>
            </Card>
          ) : null}

          {(mayDispose || mayMove) && asset.status !== "DISPOSED" ? (
            <Card>
              <CardHeader title="Change its state" />
              <CardBody>
                <StatusPanel
                  id={asset.id}
                  status={asset.status}
                  netBookMinor={value.netBookMinor}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
