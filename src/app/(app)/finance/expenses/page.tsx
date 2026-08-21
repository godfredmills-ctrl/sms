import type { Metadata } from "next";
import { Banknote, ClipboardCheck, HandCoins, Plus } from "lucide-react";

import { LedgerSearch } from "@/components/ledger-search";
import { Pager, pageOf } from "@/components/pager";
import { Alert, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { fullName } from "@/lib/utils";

import { ExpensesTable, type ExpenseRow } from "./expenses-table";

export const metadata: Metadata = { title: "Expenditure" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("finance.expense.read");

  const params = await searchParams;
  const { page, skip, take } = pageOf(params, PER_PAGE);
  const query = String(params.q ?? "").trim();

  const where = query
    ? {
        OR: [
          { reference: { contains: query, mode: "insensitive" as const } },
          { description: { contains: query, mode: "insensitive" as const } },
          { paymentRef: { contains: query, mode: "insensitive" as const } },
          { vendor: { name: { contains: query, mode: "insensitive" as const } } },
          { category: { name: { contains: query, mode: "insensitive" as const } } },
        ],
      }
    : {};

  // Every figure in the row of cards describes the whole ledger, so every one
  // of them is aggregated in the database rather than summed from the fifty
  // rows on screen — which would have made each card shrink as the bursar
  // paged backwards through the year.
  const [matching, paidAgg, approvedAgg, pendingAgg, taxAgg, expenses] = await Promise.all([
    db.expense.count({ where }),
    db.expense.aggregate({ where: { status: "PAID" }, _sum: { amountMinor: true } }),
    db.expense.aggregate({
      where: { status: "APPROVED" },
      _sum: { amountMinor: true },
      _count: true,
    }),
    db.expense.aggregate({
      where: { status: "PENDING" },
      _sum: { amountMinor: true },
      _count: true,
    }),
    db.expense.aggregate({
      where: { status: { in: ["APPROVED", "PAID"] } },
      _sum: { taxMinor: true },
    }),
    db.expense.findMany({
      where,
      orderBy: [{ incurredOn: "desc" }, { createdAt: "desc" }],
      skip,
      take,
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
        category: { select: { name: true } },
        vendor: { select: { name: true } },
        requestedBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const rows: ExpenseRow[] = expenses.map((expense) => ({
    id: expense.id,
    reference: expense.reference,
    description: expense.description,
    category: expense.category.name,
    vendor: expense.vendor?.name ?? null,
    amountMinor: expense.amountMinor,
    taxMinor: expense.taxMinor,
    status: expense.status,
    incurredOn: expense.incurredOn.toISOString(),
    paidOn: expense.paidOn?.toISOString() ?? null,
    method: expense.method,
    requestedBy: expense.requestedBy ? fullName(expense.requestedBy) : null,
  }));

  const owed = approvedAgg._sum.amountMinor ?? 0;
  const waiting = pendingAgg._sum.amountMinor ?? 0;

  return (
    <>
      <PageHeader
        title="Expenditure"
        description="What the school spends, and what it still owes. These are the figures under the expenditure half of the statement."
        action={
          userCan(user, "finance.expense.record") ? (
            <LinkButton href="/finance/expenses/new" size="sm">
              <Plus className="size-4" />
              Record a bill
            </LinkButton>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Paid"
          value={formatMoney(paidAgg._sum.amountMinor ?? 0)}
          hint="Money that has left the account"
          tone="neutral"
          icon={<Banknote className="size-4" />}
        />
        <StatCard
          label="Approved, unpaid"
          value={formatMoney(owed)}
          hint={`${approvedAgg._count} bill${approvedAgg._count === 1 ? "" : "s"} owed`}
          tone={owed > 0 ? "warning" : "success"}
          icon={<HandCoins className="size-4" />}
        />
        <StatCard
          label="Awaiting approval"
          value={formatMoney(waiting)}
          hint={`${pendingAgg._count} to decide`}
          tone={waiting > 0 ? "info" : "neutral"}
          icon={<ClipboardCheck className="size-4" />}
        />
        <StatCard
          label="Withholding tax"
          value={formatMoney(taxAgg._sum.taxMinor ?? 0)}
          hint="Kept back, and owed to the GRA"
          tone="violet"
        />
      </div>

      {pendingAgg._count > 0 && userCan(user, "finance.expense.approve") ? (
        <Alert tone="info" className="mb-4">
          {pendingAgg._count} bill{pendingAgg._count === 1 ? " is" : "s are"} waiting for a
          decision. Nothing awaiting approval appears in the income and expenditure
          statement, so an unapproved pile makes the term look cheaper than it was.
        </Alert>
      ) : null}

      <LedgerSearch
        action="/finance/expenses"
        defaultValue={query}
        placeholder="Reference, description, vendor or category…"
        label="Search all expenditure"
        found={matching}
        noun="bill"
      />

      <ExpensesTable rows={rows} />

      <Pager
        basePath="/finance/expenses"
        searchParams={params}
        page={page}
        perPage={PER_PAGE}
        total={matching}
        label="bills"
      />
    </>
  );
}
