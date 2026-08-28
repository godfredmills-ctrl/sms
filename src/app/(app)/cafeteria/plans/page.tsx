import type { Metadata } from "next";
import { Ticket } from "lucide-react";

import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { sittingLabel, sortSittings } from "@/lib/cafeteria-rules";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

import { PlanButton, PlanEditButton } from "./plan-forms";

export const metadata: Metadata = { title: "Meal plans" };
export const dynamic = "force-dynamic";

export default async function MealPlansPage() {
  const user = await requirePermission("cafeteria.read");
  const canManage = userCan(user, "cafeteria.plan.manage");

  const plans = await db.mealPlan.findMany({
    orderBy: [{ isActive: "desc" }, { priceMinor: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      sittings: true,
      priceMinor: true,
      perMealMinor: true,
      isActive: true,
      _count: { select: { subscriptions: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Meal plans"
        description="What a family can buy, and what one meal costs somebody who has not bought it."
        action={canManage ? <PlanButton /> : null}
      />

      {plans.length === 0 ? (
        <Alert tone="info">
          Nothing has been set up yet. Until a plan exists, every meal the
          kitchen serves is recorded as cash at whatever the counter charges,
          and nobody appears on the expected list for a sitting.
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className={plan.isActive ? undefined : "opacity-70"}>
            <CardHeader
              title={plan.name}
              description={plan.description ?? undefined}
              action={
                plan.isActive ? (
                  <Badge tone="success">On sale</Badge>
                ) : (
                  <Badge tone="neutral">Withdrawn</Badge>
                )
              }
            />
            <CardBody className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="numeric text-2xl font-semibold">
                  {formatMoney(plan.priceMinor)}
                </span>
                <span className="text-sm text-[var(--text-muted)]">a term</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {sortSittings(plan.sittings).map((sitting) => (
                  <Badge key={sitting} tone="info">
                    {sittingLabel(sitting)}
                  </Badge>
                ))}
              </div>

              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Off-plan meal</dt>
                  <dd className="numeric font-medium">{formatMoney(plan.perMealMinor)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">On this plan</dt>
                  <dd className="numeric font-medium">
                    {plan._count.subscriptions.toLocaleString()}
                  </dd>
                </div>
              </dl>

              <p className="text-xs leading-relaxed text-[var(--text-subtle)]">
                <Ticket className="mr-1 inline size-3" />
                Code {plan.code}. A pupil on this plan who comes to a sitting it
                does not cover is served and charged {formatMoney(plan.perMealMinor)},
                not turned away.
              </p>

              {canManage ? (
                <PlanEditButton
                  plan={{
                    id: plan.id,
                    code: plan.code,
                    name: plan.name,
                    description: plan.description ?? "",
                    sittings: plan.sittings,
                    price: (plan.priceMinor / 100).toFixed(2),
                    perMeal: (plan.perMealMinor / 100).toFixed(2),
                    isActive: plan.isActive,
                  }}
                />
              ) : null}
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
