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
import { EXPENSE_STATUSES, EXPENSE_TRANSITIONS } from "@/lib/expense-labels";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, fullName, humanise } from "@/lib/utils";

import { Decide } from "../decide";
import { ExpenseForm } from "../expense-form";
import { expensePickers, todayValue } from "../pickers";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const expense = await db.expense.findUnique({
    where: { id },
    select: { reference: true },
  });
  return { title: expense?.reference ?? "Expense" };
}

export default async function ExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("finance.expense.read");
  const { id } = await params;

  const expense = await db.expense.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      description: true,
      amountMinor: true,
      taxMinor: true,
      status: true,
      incurredOn: true,
      paidOn: true,
      method: true,
      paymentRef: true,
      notes: true,
      decisionNote: true,
      approvedAt: true,
      createdAt: true,
      categoryId: true,
      vendorId: true,
      category: { select: { name: true, kind: true } },
      vendor: { select: { id: true, name: true, tin: true, phone: true } },
      term: { select: { name: true, academicYear: { select: { name: true } } } },
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      approvedBy: { select: { firstName: true, lastName: true } },
    },
  });

  if (!expense) notFound();

  const status = EXPENSE_STATUSES.find((entry) => entry.value === expense.status);

  // The buttons come from the same table the action enforces, filtered by what
  // this person may actually do — so a button that appears is a button that
  // works, rather than one that explains itself only after being pressed.
  const allowed = (EXPENSE_TRANSITIONS[expense.status] ?? []).filter((next) => {
    if (next === "PAID") return userCan(user, "finance.expense.pay");
    if (next === "VOID") {
      return expense.status === "PENDING" || expense.status === "REJECTED"
        ? userCan(user, "finance.expense.record")
        : userCan(user, "finance.expense.approve");
    }
    return userCan(user, "finance.expense.approve");
  });

  // Nobody approves their own bill, so the button is not offered to the person
  // who recorded it — the action refuses it either way, and being told after
  // pressing is worse than not being offered.
  const own = expense.requestedBy?.id === user.id;
  const buttons = own ? allowed.filter((next) => next !== "APPROVED") : allowed;

  const editable = expense.status === "PENDING" || expense.status === "REJECTED";
  const canEdit = editable && userCan(user, "finance.expense.record");
  const { categories, vendors } = canEdit
    ? await expensePickers(expense.categoryId)
    : { categories: [], vendors: [] };

  return (
    <div>
      <PageHeader
        title={expense.reference}
        description={expense.description}
        breadcrumb={
          <Link href="/finance/expenses" className="hover:text-[var(--text)]">
            Expenditure
          </Link>
        }
        action={<Badge tone={status?.tone ?? "neutral"}>{status?.label ?? expense.status}</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="The bill" description={status?.description} />
            <CardBody>
              <DescriptionList
                items={[
                  { label: "Amount", value: formatMoney(expense.amountMinor) },
                  ...(expense.taxMinor
                    ? [
                        {
                          label: "Withholding tax",
                          value: `${formatMoney(expense.taxMinor)}: the vendor receives ${formatMoney(
                            expense.amountMinor - expense.taxMinor,
                          )}`,
                        },
                      ]
                    : []),
                  { label: "Category", value: expense.category.name },
                  {
                    label: "Vendor",
                    value: expense.vendor
                      ? `${expense.vendor.name}${expense.vendor.tin ? ` · TIN ${expense.vendor.tin}` : ""}`
                      : "None recorded",
                  },
                  { label: "Incurred", value: formatDate(expense.incurredOn, "long") },
                  {
                    label: "Period",
                    value: expense.term
                      ? `${expense.term.name}, ${expense.term.academicYear.name}`
                      : "Outside term time",
                  },
                  ...(expense.paidOn
                    ? [
                        {
                          label: "Paid",
                          value: `${formatDate(expense.paidOn, "long")} · ${humanise(expense.method)}${
                            expense.paymentRef ? ` · ${expense.paymentRef}` : ""
                          }`,
                        },
                      ]
                    : []),
                  ...(expense.notes ? [{ label: "Notes", value: expense.notes }] : []),
                ]}
              />
            </CardBody>
          </Card>

          {expense.decisionNote ? (
            <Alert tone={expense.status === "REJECTED" ? "danger" : "warning"} title="Note on the decision">
              {expense.decisionNote}
            </Alert>
          ) : null}

          {canEdit ? (
            <Card>
              <CardHeader
                title="Amend"
                description="Only while it is waiting for a decision. Once approved it is voided and recorded again, so the change is on the record."
              />
              <CardBody>
                <ExpenseForm
                  draft={{
                    id: expense.id,
                    description: expense.description,
                    categoryId: expense.categoryId,
                    vendorId: expense.vendorId ?? "",
                    amount: (expense.amountMinor / 100).toFixed(2),
                    tax: expense.taxMinor ? (expense.taxMinor / 100).toFixed(2) : "",
                    incurredOn: expense.incurredOn.toISOString().slice(0, 10),
                    notes: expense.notes ?? "",
                  }}
                  categories={categories}
                  vendors={vendors}
                  today={todayValue()}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Decision" />
            <CardBody className="space-y-3">
              {own && expense.status === "PENDING" ? (
                <Alert tone="info">
                  You recorded this, so somebody else has to approve it: the head
                  teacher, or whoever else can approve expenditure.
                </Alert>
              ) : null}
              {buttons.length ? (
                <Decide id={expense.id} allowed={buttons} today={todayValue()} />
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  Nothing left to decide here.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Trail" />
            <CardBody>
              <DescriptionList
                items={[
                  {
                    label: "Recorded",
                    value: `${formatDateTime(expense.createdAt)}${
                      expense.requestedBy ? ` by ${fullName(expense.requestedBy)}` : ""
                    }`,
                  },
                  ...(expense.approvedAt
                    ? [
                        {
                          label: "Approved",
                          value: `${formatDateTime(expense.approvedAt)}${
                            expense.approvedBy ? ` by ${fullName(expense.approvedBy)}` : ""
                          }`,
                        },
                      ]
                    : []),
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
