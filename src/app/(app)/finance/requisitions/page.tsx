import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Clock, HandCoins, PackageCheck, Plus } from "lucide-react";

import {
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
import { currentTerm } from "@/lib/current-term";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import {
  estimateTotal,
  fulfilment,
  outstandingTotal,
  statusLabel,
  statusTone,
} from "@/lib/requisition-rules";
import { formatDate, fullName } from "@/lib/utils";

export const metadata: Metadata = { title: "Requisitions" };
export const dynamic = "force-dynamic";

/**
 * Requisitions: what the school has been asked to buy.
 *
 * The expenditure module records what was spent, which arrives too late to
 * change anything. This is the half that arrives in time, and the figure it
 * makes possible is committed: approved and not yet met, and therefore gone as
 * far as the budget is concerned even though no bill exists.
 */
export default async function RequisitionsPage() {
  const user = await requirePermission([
    "finance.requisition.read",
    "finance.requisition.request",
    "finance.requisition.approve",
  ]);

  const mayApprove = userCan(user, "finance.requisition.approve");
  const mayRaise = userCan(user, "finance.requisition.request");
  const seesAll = userCan(user, "finance.requisition.read") || mayApprove;

  const term = await currentTerm();

  const rows = await db.requisition.findMany({
    where: seesAll
      ? term.academicYearId
        ? { academicYearId: term.academicYearId }
        : {}
      : // Somebody who may only raise them sees their own. Not a privacy rule
        // so much as a useful one: a list of every request in the school is not
        // what a head of department opened this page for.
        { requestedById: user.staffId ?? "" },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      requestedById: true,
      department: true,
      neededBy: true,
      createdAt: true,
      category: { select: { name: true } },
      requestedBy: { select: { firstName: true, lastName: true, title: true } },
      lines: {
        select: { quantity: true, estimatedUnitMinor: true, fulfilledQty: true },
      },
    },
  });

  const waiting = rows.filter((row) => row.status === "SUBMITTED");
  const approved = rows.filter((row) => row.status === "APPROVED");

  const committedMinor = approved.reduce(
    (sum, row) => sum + outstandingTotal(row.lines),
    0,
  );
  const waitingMinor = waiting.reduce((sum, row) => sum + estimateTotal(row.lines), 0);

  // Yours, and it said so while showing everybody. The status filter was
  // there from the first draft and the one that matters was not, so a head
  // teacher opened the page and found another persons rejected request under
  // a heading that said it was theirs to finish.
  const mine = user.staffId
    ? rows.filter(
        (row) =>
          row.requestedById === user.staffId &&
          (row.status === "DRAFT" || row.status === "REJECTED"),
      )
    : [];

  return (
    <>
      <PageHeader
        title="Requisitions"
        description={`${term.yearName ?? "This year"}. What the school has been asked to buy, and what is already committed against the budget.`}
        action={
          mayRaise ? (
            <LinkButton href="/finance/requisitions/new" size="sm">
              <Plus className="size-4" />
              Raise one
            </LinkButton>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Waiting for a decision"
          value={String(waiting.length)}
          hint={waiting.length ? formatMoney(waitingMinor) : "Nothing in the queue"}
          tone={waiting.length ? "warning" : "success"}
          icon={<Clock className="size-4" />}
        />
        <StatCard
          label="Committed"
          value={formatMoney(committedMinor)}
          hint="Approved and not yet met"
          tone="info"
          icon={<HandCoins className="size-4" />}
        />
        <StatCard
          label="Approved, outstanding"
          value={String(approved.length)}
          hint={approved.length ? "Waiting on the store or a supplier" : "Nothing outstanding"}
          tone="neutral"
          icon={<PackageCheck className="size-4" />}
        />
        <StatCard
          label="Raised this year"
          value={String(rows.length)}
          tone="neutral"
          icon={<ClipboardList className="size-4" />}
        />
      </div>

      {mayApprove ? (
        <Card className="mb-4">
          <CardHeader
            title="Waiting for you"
            description="Oldest first. Nobody may decide their own."
          />
          <CardBody className="space-y-2">
            {waiting.length === 0 ? (
              <EmptyState
                icon={<PackageCheck className="size-5" />}
                title="Nothing waiting"
                description="Every request that has been sent has been looked at."
              />
            ) : (
              [...waiting]
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
                .map((row) => (
                  <Row key={row.id} row={row} />
                ))
            )}
          </CardBody>
        </Card>
      ) : null}

      {mine.length ? (
        <Card className="mb-4">
          <CardHeader
            title="Yours to finish"
            description="Drafts, and anything sent back to you."
          />
          <CardBody className="space-y-2">
            {mine.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={seesAll ? "Everything" : "Yours"}
          description="Newest first."
        />
        <CardBody className="space-y-2">
          {rows.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="size-5" />}
              title="Nothing has been asked for yet"
              description={
                mayRaise
                  ? "Raise the first one, and the budget will start showing what is committed as well as what is spent."
                  : "Requisitions raised by any department appear here."
              }
            />
          ) : (
            rows.map((row) => <Row key={row.id} row={row} />)
          )}
        </CardBody>
      </Card>
    </>
  );
}

type RowData = {
  id: string;
  reference: string;
  title: string;
  status: string;
  requestedById: string;
  department: string | null;
  neededBy: Date | null;
  category: { name: string };
  requestedBy: { firstName: string; lastName: string; title: string | null };
  lines: Array<{ quantity: number; estimatedUnitMinor: number; fulfilledQty: number }>;
};

function Row({ row }: { row: RowData }) {
  const total = estimateTotal(row.lines);
  const state = fulfilment(row.lines);

  return (
    <Link
      href={`/finance/requisitions/${row.id}`}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] p-3 transition-colors hover:bg-[var(--bg-subtle)]"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{row.title}</span>
        <span className="numeric block truncate text-xs text-[var(--text-subtle)]">
          {row.reference} · {row.category.name}
          {row.department ? ` · ${row.department}` : ""}
        </span>
        <span className="block truncate text-xs text-[var(--text-muted)]">
          {fullName(row.requestedBy)}
          {row.neededBy ? ` · needed by ${formatDate(row.neededBy)}` : ""}
        </span>
      </span>

      <span className="numeric text-sm font-semibold">{formatMoney(total)}</span>

      {row.status === "APPROVED" && state === "partial" ? (
        <Badge tone="warning">Part delivered</Badge>
      ) : null}

      <Badge tone={statusTone(row.status) as never}>{statusLabel(row.status)}</Badge>
    </Link>
  );
}
