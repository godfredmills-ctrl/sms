import type { Metadata } from "next";
import { CircleDollarSign, Receipt, Users, UtensilsCrossed } from "lucide-react";

import { Alert, PageHeader, StatCard } from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import { billingTotalMinor, unbilledSubscriptions } from "@/lib/cafeteria-rules";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { fullName } from "@/lib/utils";

import { BillButton, SubscribeButton } from "./subscription-forms";
import { SubscriptionsTable, type SubscriptionRow } from "./subscriptions-table";

export const metadata: Metadata = { title: "Meal plan subscriptions" };
export const dynamic = "force-dynamic";

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const user = await requirePermission("cafeteria.read");
  const canSubscribe = userCan(user, "cafeteria.subscribe");
  const canBill = userCan(user, "cafeteria.bill");

  const { term: requestedTerm } = await searchParams;

  const terms = await db.term.findMany({
    orderBy: [{ academicYear: { startDate: "desc" } }, { sequence: "asc" }],
    select: {
      id: true,
      name: true,
      isCurrent: true,
      academicYear: { select: { name: true } },
    },
  });

  const term =
    terms.find((entry) => entry.id === requestedTerm) ??
    terms.find((entry) => entry.isCurrent) ??
    terms[0] ??
    null;

  const [subscriptions, plans, students] = await Promise.all([
    term
      ? db.mealSubscription.findMany({
          where: { termId: term.id },
          orderBy: [{ status: "asc" }, { student: { lastName: "asc" } }],
          select: {
            id: true,
            status: true,
            startsOn: true,
            endsOn: true,
            chargedAt: true,
            chargedMinor: true,
            reason: true,
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                otherNames: true,
                admissionNo: true,
                photoUrl: true,
                enrollments: {
                  where: { status: "ACTIVE" },
                  take: 1,
                  select: {
                    classSection: {
                      select: { name: true, classLevel: { select: { name: true } } },
                    },
                  },
                },
              },
            },
            plan: { select: { id: true, name: true, priceMinor: true } },
          },
        })
      : Promise.resolve([]),
    db.mealPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMinor: "asc" },
      select: { id: true, name: true, priceMinor: true },
    }),
    canSubscribe
      ? db.student.findMany({
          where: { status: "ENROLLED" },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: { id: true, firstName: true, lastName: true, otherNames: true, admissionNo: true },
        })
      : Promise.resolve([]),
  ]);

  const rows: SubscriptionRow[] = subscriptions.map((subscription) => ({
    id: subscription.id,
    studentId: subscription.student.id,
    name: fullName(subscription.student),
    admissionNo: subscription.student.admissionNo,
    photoUrl: subscription.student.photoUrl,
    className: subscription.student.enrollments[0]
      ? `${subscription.student.enrollments[0].classSection.classLevel.name} ${subscription.student.enrollments[0].classSection.name}`
      : "",
    planName: subscription.plan.name,
    priceMinor: subscription.plan.priceMinor,
    status: subscription.status,
    startsOn: subscription.startsOn.toISOString(),
    endsOn: subscription.endsOn?.toISOString() ?? null,
    charged: Boolean(subscription.chargedAt),
    chargedMinor: subscription.chargedMinor,
    reason: subscription.reason,
  }));

  const active = rows.filter((row) => row.status === "ACTIVE").length;
  const unbilled = unbilledSubscriptions(
    subscriptions.map((subscription) => ({
      status: subscription.status,
      chargedAt: subscription.chargedAt,
      plan: { priceMinor: subscription.plan.priceMinor },
    })),
  );
  const owing = billingTotalMinor(unbilled);
  const billed = rows.filter((row) => row.charged);
  const billedTotal = billed.reduce((sum, row) => sum + (row.chargedMinor ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Meal plan subscriptions"
        description={
          term
            ? `Who is on what for ${term.name}, ${term.academicYear.name}.`
            : "No terms have been set up yet."
        }
        action={
          <>
            <RefreshButton />
            {canSubscribe && term ? (
              <SubscribeButton
                termId={term.id}
                plans={plans.map((plan) => ({
                  value: plan.id,
                  label: plan.name,
                  description: `${formatMoney(plan.priceMinor)} a term`,
                }))}
                students={students.map((student) => ({
                  value: student.id,
                  label: fullName(student),
                  description: student.admissionNo,
                }))}
              />
            ) : null}
          </>
        }
      />

      {terms.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {terms.slice(0, 6).map((entry) => (
            <a
              key={entry.id}
              href={`/cafeteria/subscriptions?term=${entry.id}`}
              className={
                entry.id === term?.id
                  ? "rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-1.5 text-sm font-medium text-[var(--primary)]"
                  : "rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
              }
            >
              {entry.name}
              <span className="ml-1.5 text-xs opacity-70">{entry.academicYear.name}</span>
            </a>
          ))}
        </div>
      ) : null}

      {plans.length === 0 ? (
        <Alert tone="warning" className="mb-4">
          No plans are on sale, so nobody can be put on one. Create a plan first.
        </Alert>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="On a plan"
          value={active.toLocaleString()}
          hint={`${rows.length} rows including ended`}
          tone="violet"
          icon={<UtensilsCrossed className="size-4" />}
        />
        <StatCard
          label="Charged"
          value={billed.length.toLocaleString()}
          hint={formatMoney(billedTotal)}
          tone="success"
          icon={<Receipt className="size-4" />}
        />
        <StatCard
          label="Not yet charged"
          value={unbilled.length.toLocaleString()}
          hint={formatMoney(owing)}
          tone={unbilled.length ? "warning" : "success"}
          icon={<CircleDollarSign className="size-4" />}
        />
        <StatCard
          label="Plans on sale"
          value={plans.length.toLocaleString()}
          tone="info"
          icon={<Users className="size-4" />}
        />
      </div>

      {canBill && term && unbilled.length > 0 ? (
        <Alert tone="info" className="mb-4">
          <span className="block font-medium">
            {unbilled.length} meal {unbilled.length === 1 ? "plan has" : "plans have"} not
            reached a bill, worth {formatMoney(owing)}.
          </span>
          <span className="mb-2 block">
            Each charge is added as a line on the family&rsquo;s existing invoice for
            the term rather than as a bill of its own, so a parent gets one
            invoice. A pupil with no open invoice for {term.name} is skipped and
            counted, not silently dropped.
          </span>
          <BillButton termId={term.id} count={unbilled.length} totalMinor={owing} />
        </Alert>
      ) : null}

      <SubscriptionsTable rows={rows} canManage={canSubscribe} />
    </>
  );
}
