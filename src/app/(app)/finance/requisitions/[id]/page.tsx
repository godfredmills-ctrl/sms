import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  PageHeader,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import {
  committed,
  editable,
  estimateTotal,
  lineTotal,
  outstandingTotal,
  statusHint,
  statusLabel,
  statusTone,
  verdictFor,
  type Role,
} from "@/lib/requisition-rules";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";

import { BudgetStrip, MoveForm, ReceiveForm, RequisitionForm } from "../requisition-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const row = await db.requisition
    .findUnique({ where: { id }, select: { reference: true, title: true } })
    .catch(() => null);
  return { title: row ? `${row.reference}: ${row.title}` : "Requisition" };
}

/**
 * One requisition: what was asked for, what the budget says, and what happens
 * next.
 *
 * The budget strip is the point of the screen. A person approving a request
 * for two thousand cedis of textbooks needs to know what is left on the line
 * before they sign, and until this module existed the honest answer was that
 * nobody could tell them without opening a drawer.
 */
export default async function RequisitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission([
    "finance.requisition.read",
    "finance.requisition.request",
    "finance.requisition.approve",
    "finance.requisition.fulfil",
  ]);

  const { id } = await params;

  const row = await db.requisition.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, firstName: true, lastName: true, title: true } },
      decidedBy: { select: { firstName: true, lastName: true, title: true } },
      lines: { orderBy: { sortKey: "asc" } },
    },
  });
  if (!row) notFound();

  const own = user.staffId === row.requestedById;
  const mayRead = userCan(user, "finance.requisition.read");
  const mayApprove = userCan(user, "finance.requisition.approve");
  const mayFulfil = userCan(user, "finance.requisition.fulfil");

  // A department head reads their own. Reading everybody's is its own
  // permission, the same shape as everywhere else in this system.
  if (!own && !mayRead && !mayApprove && !mayFulfil) notFound();

  const roles: Role[] = [];
  if (own) roles.push("requester");
  if (mayApprove) roles.push("approver");
  if (mayFulfil) roles.push("storekeeper");

  const total = estimateTotal(row.lines);
  const outstanding = outstandingTotal(row.lines);

  /*
   * The budget line, computed the same way the action computes it.
   *
   * Deliberately excluding this requisition from the committed figure when it
   * is already approved: counting it in the line AND again as the request
   * would show a bursar an overspend twice the size of the real one, on the
   * screen whose whole job is to be trusted about that number.
   */
  const [budget, expenses, others] = await Promise.all([
    row.academicYearId
      ? db.budgetLine.findUnique({
          where: {
            academicYearId_categoryId: {
              academicYearId: row.academicYearId,
              categoryId: row.categoryId,
            },
          },
          select: { amountMinor: true },
        })
      : Promise.resolve(null),
    db.expense.findMany({
      where: {
        categoryId: row.categoryId,
        status: { in: ["APPROVED", "PAID"] },
        ...(row.academicYearId ? { academicYearId: row.academicYearId } : {}),
      },
      select: { amountMinor: true },
    }),
    db.requisition.findMany({
      where: {
        categoryId: row.categoryId,
        status: "APPROVED",
        id: { not: row.id },
        ...(row.academicYearId ? { academicYearId: row.academicYearId } : {}),
      },
      select: { lines: { select: { quantity: true, estimatedUnitMinor: true, fulfilledQty: true } } },
    }),
  ]);

  const verdict = verdictFor(
    {
      budgetMinor: budget?.amountMinor ?? null,
      spentMinor: expenses.reduce((sum, expense) => sum + expense.amountMinor, 0),
      committedMinor: others.reduce((sum, other) => sum + outstandingTotal(other.lines), 0),
    },
    outstanding,
  );

  if (editable(row.status) && own) {
    return (
      <>
        <PageHeader
          title={row.title}
          description={`${row.reference}. A draft, and only you can see it.`}
          breadcrumb={
            <Link href="/finance/requisitions" className="hover:text-[var(--text)]">
              Requisitions
            </Link>
          }
          action={<Badge tone={statusTone(row.status) as never}>{statusLabel(row.status)}</Badge>}
        />

        <div className="mb-4">
          <MoveForm
            id={row.id}
            status={row.status}
            roles={roles}
            verdict={verdict}
            requestMinor={total}
          />
        </div>

        <EditForm row={row} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={row.title}
        description={`${row.reference}. ${statusHint(row.status)}`}
        breadcrumb={
          <Link href="/finance/requisitions" className="hover:text-[var(--text)]">
            Requisitions
          </Link>
        }
        action={<Badge tone={statusTone(row.status) as never}>{statusLabel(row.status)}</Badge>}
      />

      {row.status === "REJECTED" && row.decisionNote ? (
        <Alert tone="danger" title="Sent back" className="mb-4">
          {row.decisionNote}
        </Alert>
      ) : null}

      {row.status === "APPROVED" && row.decisionNote ? (
        <Alert tone="warning" title="Approved with a note" className="mb-4">
          {row.decisionNote}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="What is being asked for"
              description="Estimates. The bill decides the real figure."
              action={<span className="numeric font-semibold">{formatMoney(total)}</span>}
            />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs tracking-wider text-[var(--text-subtle)] uppercase">
                      <th className="pb-2">Item</th>
                      <th className="pb-2 text-right">Asked</th>
                      <th className="pb-2 text-right">Received</th>
                      <th className="pb-2 text-right">Each</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {row.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-2">
                          {line.description}
                          {line.unit ? (
                            <span className="text-[var(--text-subtle)]"> ({line.unit})</span>
                          ) : null}
                        </td>
                        <td className="numeric py-2 text-right">{line.quantity}</td>
                        <td className="numeric py-2 text-right">
                          {line.fulfilledQty}
                          {line.fulfilledQty > 0 && line.fulfilledQty < line.quantity ? (
                            <span className="text-[var(--warning)]"> ·</span>
                          ) : null}
                        </td>
                        <td className="numeric py-2 text-right">
                          {formatMoney(line.estimatedUnitMinor)}
                        </td>
                        <td className="numeric py-2 text-right font-medium">
                          {formatMoney(lineTotal(line))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {row.justification ? (
                <p className="mt-4 text-sm leading-relaxed whitespace-pre-line">
                  {row.justification}
                </p>
              ) : null}
            </CardBody>
          </Card>

          {committed(row.status) && mayFulfil ? (
            <Card>
              <CardHeader
                title="What has arrived"
                description="Recorded line by line, so half a delivery releases half the commitment."
              />
              <CardBody>
                <ReceiveForm
                  id={row.id}
                  lines={row.lines.map((line) => ({
                    id: line.id,
                    description: line.description,
                    quantity: line.quantity,
                    unit: line.unit,
                    fulfilledQty: line.fulfilledQty,
                  }))}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title={row.category.name}
              description={
                committed(row.status)
                  ? "This request is counted in the bar."
                  : "What approving it would do to the line."
              }
            />
            <CardBody>
              <BudgetStrip verdict={verdict} requestMinor={outstanding} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="The record" />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Reference", value: row.reference },
                  { label: "Raised by", value: fullName(row.requestedBy) },
                  { label: "Department", value: row.department ?? "Not stated" },
                  {
                    label: "Needed by",
                    value: row.neededBy ? formatDate(row.neededBy) : "Not stated",
                  },
                  {
                    label: "Sent",
                    value: row.submittedAt ? formatDateTime(row.submittedAt) : "Not yet",
                  },
                  {
                    label: "Decided by",
                    value: row.decidedBy ? fullName(row.decidedBy) : "Nobody yet",
                  },
                  {
                    label: "Decided",
                    value: row.decidedAt ? formatDateTime(row.decidedAt) : "Not yet",
                  },
                  {
                    label: "Still outstanding",
                    value: committed(row.status) ? formatMoney(outstanding) : "Not committed",
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="What happens next" />
            <CardBody>
              <MoveForm
                id={row.id}
                status={row.status}
                roles={roles}
                verdict={verdict}
                requestMinor={outstanding}
              />
              {roles.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  You can read this one. Deciding it belongs to somebody else.
                </p>
              ) : null}
              {own && mayApprove ? (
                <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                  You raised this one, so you cannot decide it however senior
                  you are. The screen does not offer it and the database refuses
                  it.
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

/** The draft editor, given the row already read above. */
async function EditForm({
  row,
}: {
  row: {
    id: string;
    title: string;
    categoryId: string;
    department: string | null;
    justification: string | null;
    neededBy: Date | null;
    lines: Array<{
      description: string;
      quantity: number;
      estimatedUnitMinor: number;
      unit: string | null;
      stockItemId: string | null;
    }>;
  };
}) {
  const [categories, stockItems] = await Promise.all([
    db.expenseCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, code: true },
    }),
    db.stockItem.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, unit: true },
    }),
  ]);

  return (
    <RequisitionForm
      id={row.id}
      categories={categories.map((category) => ({
        value: category.id,
        label: category.name,
        description: category.code ?? undefined,
      }))}
      stockItems={stockItems.map((item) => ({
        value: item.id,
        label: item.name,
        description: item.unit ?? undefined,
      }))}
      values={{
        title: row.title,
        categoryId: row.categoryId,
        department: row.department ?? "",
        justification: row.justification ?? "",
        neededBy: row.neededBy ? row.neededBy.toISOString().slice(0, 10) : "",
        lines: row.lines.map((line) => ({
          description: line.description,
          quantity: String(line.quantity),
          price: (line.estimatedUnitMinor / 100).toFixed(2),
          unit: line.unit ?? "",
          stockItemId: line.stockItemId ?? "",
        })),
      }}
    />
  );
}
