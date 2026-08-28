import type { Metadata } from "next";
import { AlertTriangle, ChefHat, CircleDollarSign, UserCheck, Users } from "lucide-react";

import { Alert, Badge, Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { RefreshButton } from "@/components/refresh-button";
import { requirePermission, userCan } from "@/lib/auth";
import {
  SITTINGS,
  absentFromService,
  allergenLabel,
  cycleWeekFor,
  dayLabel,
  isoDay,
  serviceTotals,
  sittingLabel,
} from "@/lib/cafeteria-rules";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

import { ServingCounter } from "./serving-counter";
import { SittingButtons } from "./sitting-buttons";

export const metadata: Metadata = { title: "Cafeteria" };
export const dynamic = "force-dynamic";

/**
 * The counter.
 *
 * One page, one day, one sitting at a time. Everything a school does at a meal
 * happens here: open the sitting, find the child, see what they cannot eat,
 * record that they ate. The menu and the plans are configuration and live
 * elsewhere; this is the screen that is open three times a day with somebody
 * standing in front of it.
 */
export default async function CafeteriaPage({
  searchParams,
}: {
  searchParams: Promise<{ sitting?: string; date?: string }>;
}) {
  const user = await requirePermission("cafeteria.read");
  const canServe = userCan(user, "cafeteria.serve");
  const canSeeAllergies = userCan(user, "student.medical.read");

  const { sitting: requested, date: requestedDate } = await searchParams;

  const now = new Date();
  const servedOn = requestedDate
    ? new Date(`${requestedDate}T12:00:00`)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(servedOn.getFullYear(), servedOn.getMonth(), servedOn.getDate());

  // Lunch unless asked otherwise: it is the sitting every school serves and
  // the one the screen is most often opened for.
  const sitting =
    SITTINGS.find((entry) => entry.value === requested)?.value ?? "LUNCH";

  const [service, menu, plans] = await Promise.all([
    db.mealService.findFirst({
      where: { servedOn: day, sitting },
      select: {
        id: true,
        dishServed: true,
        allergens: true,
        expectedCount: true,
        openedAt: true,
        closedAt: true,
        notes: true,
        menuItem: {
          select: { dish: true, accompaniment: true, allergens: true, isVegetarian: true },
        },
        records: {
          orderBy: { servedAt: "desc" },
          select: {
            id: true,
            basis: true,
            chargedMinor: true,
            servedAt: true,
            servedBy: true,
            warned: true,
            warnedNote: true,
            guestName: true,
            studentId: true,
            staffId: true,
            student: {
              select: {
                firstName: true,
                lastName: true,
                admissionNo: true,
                photoUrl: true,
              },
            },
            staff: { select: { firstName: true, lastName: true, staffNo: true } },
          },
        },
      },
    }),
    db.mealMenu.findFirst({
      where: { isActive: true },
      select: {
        name: true,
        startsOn: true,
        cycleWeeks: true,
        items: {
          select: {
            weekNumber: true,
            dayOfWeek: true,
            sitting: true,
            dish: true,
            accompaniment: true,
            allergens: true,
            isVegetarian: true,
          },
        },
      },
    }),
    db.mealPlan.count({ where: { isActive: true } }),
  ]);

  // What the rota says for this day and sitting, whether or not it has opened.
  const week = menu ? cycleWeekFor(day, menu.startsOn, menu.cycleWeeks) : null;
  const planned =
    menu && week
      ? (menu.items.find(
          (item) =>
            item.weekNumber === week &&
            item.dayOfWeek === isoDay(day) &&
            item.sitting === sitting,
        ) ?? null)
      : null;

  const totals = service ? serviceTotals(service.records) : null;
  const missing = service && totals ? absentFromService(service.expectedCount, service.records) : 0;

  const allergens = service?.allergens.length ? service.allergens : (planned?.allergens ?? []);

  return (
    <>
      <PageHeader
        title="Cafeteria"
        description={`${formatDate(day)}. ${dayLabel(isoDay(day))}${
          week ? `, week ${week} of the menu` : ""
        }.`}
        action={<RefreshButton />}
      />

      {plans === 0 ? (
        <Alert tone="warning" className="mb-4">
          No meal plans have been set up, so nobody is on one and every meal
          served will be recorded as cash. Meal plans is where they are created.
        </Alert>
      ) : null}

      {!menu ? (
        <Alert tone="info" className="mb-4">
          No menu is live, so the screen cannot say what is being cooked or what
          is in it. That also means no allergy warnings: a warning needs a list
          of what is on the plate to compare a child&rsquo;s allergies against.
        </Alert>
      ) : null}

      <SittingButtons
        current={sitting}
        date={requestedDate ?? null}
        openSittings={undefined}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* ----------------------------------------------------------------- */}
        {/* What is being served                                              */}
        {/* ----------------------------------------------------------------- */}
        <Card className="lg:col-span-1">
          <CardHeader
            title={sittingLabel(sitting)}
            description={service ? (service.closedAt ? "Closed" : "Open") : "Not opened yet"}
            action={<ChefHat className="size-4 text-[var(--text-subtle)]" />}
          />
          <CardBody className="space-y-3">
            <div>
              <p className="text-xs text-[var(--text-muted)]">On the menu</p>
              <p className="font-medium">
                {service?.dishServed ?? planned?.dish ?? "Nothing on the rota"}
              </p>
              {(service?.menuItem?.accompaniment ?? planned?.accompaniment) ? (
                <p className="text-sm text-[var(--text-muted)]">
                  with {service?.menuItem?.accompaniment ?? planned?.accompaniment}
                </p>
              ) : null}
            </div>

            <div>
              <p className="mb-1 text-xs text-[var(--text-muted)]">Contains</p>
              {allergens.length ? (
                <div className="flex flex-wrap gap-1">
                  {allergens.map((allergen) => (
                    <Badge key={allergen} tone="warning">
                      {allergenLabel(allergen)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  Nothing declared. That is not the same as nothing present:
                  a dish with no allergens recorded raises no warnings at all.
                </p>
              )}
            </div>

            {(service?.menuItem?.isVegetarian ?? planned?.isVegetarian) ? (
              <Badge tone="success">Vegetarian</Badge>
            ) : null}

            {service?.notes ? (
              <p className="text-sm text-[var(--text-muted)]">{service.notes}</p>
            ) : null}
          </CardBody>
        </Card>

        {/* ----------------------------------------------------------------- */}
        {/* The counter                                                       */}
        {/* ----------------------------------------------------------------- */}
        <div className="lg:col-span-2">
          {!canSeeAllergies ? (
            <Alert tone="danger" className="mb-4">
              <span className="block font-medium">Allergy warnings are hidden from you.</span>
              <span className="block">
                Showing them needs the &ldquo;View student medical history and
                allergies&rdquo; permission. Serving without it is possible and is
                not advisable: the screen cannot tell you what a child must not
                eat. Ask an administrator before using this counter.
              </span>
            </Alert>
          ) : null}

          <ServingCounter
            service={
              service
                ? {
                    id: service.id,
                    closed: Boolean(service.closedAt),
                    expectedCount: service.expectedCount,
                  }
                : null
            }
            sitting={sitting}
            servedOn={
              `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`
            }
            canServe={canServe}
            records={(service?.records ?? []).map((record) => ({
              id: record.id,
              name: record.student
                ? `${record.student.firstName} ${record.student.lastName}`
                : record.staff
                  ? `${record.staff.firstName} ${record.staff.lastName}`
                  : (record.guestName ?? "Guest"),
              reference: record.student?.admissionNo ?? record.staff?.staffNo ?? "Guest",
              photoUrl: record.student?.photoUrl ?? null,
              basis: record.basis,
              chargedMinor: record.chargedMinor,
              warned: record.warned,
              warnedNote: record.warnedNote,
              servedBy: record.servedBy,
            }))}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* The count                                                           */}
      {/* ------------------------------------------------------------------- */}
      {service && totals ? (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Served"
            value={totals.served.toLocaleString()}
            hint={`${totals.students} pupils, ${totals.staff} staff, ${totals.guests} guests`}
            tone="info"
            icon={<UserCheck className="size-4" />}
          />
          <StatCard
            label="On a plan"
            value={totals.onPlan.toLocaleString()}
            hint={`of ${service.expectedCount} entitled`}
            tone="violet"
            icon={<Users className="size-4" />}
          />
          <StatCard
            label="Not accounted for"
            value={missing.toLocaleString()}
            hint={
              missing
                ? "Entitled and did not come"
                : "Everybody entitled was served"
            }
            tone={missing ? "warning" : "success"}
            icon={<AlertTriangle className="size-4" />}
          />
          <StatCard
            label="Takings"
            value={formatMoney(totals.takingsMinor)}
            hint={`${totals.paid} paid at the counter`}
            tone="teal"
            icon={<CircleDollarSign className="size-4" />}
          />
        </div>
      ) : null}

      {/*
        The welfare line, which is the reason a boarding school wants this
        module at all. A boarder entitled to supper who did not come to it is
        not primarily a catering discrepancy.
      */}
      {service && missing > 0 && service.closedAt ? (
        <Alert tone="warning" className="mt-4">
          {missing} {missing === 1 ? "person was" : "people were"} entitled to this
          sitting and not served. In a boarding house that is a roll call that did
          not come out: check the house lists before treating it as a catering
          figure.
        </Alert>
      ) : null}
    </>
  );
}
