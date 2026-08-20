import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Bus, MapPin, Route as RouteIcon, Users } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { notFound } from "next/navigation";

import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { capacityOf, fitnessOf } from "@/lib/transport";
import { formatDate } from "@/lib/utils";

import { RouteForm, VehicleForm } from "./forms";

export const metadata: Metadata = { title: "Transport" };
export const dynamic = "force-dynamic";

/**
 * School transport.
 *
 * The page leads with the two things that stop a bus running — a route over
 * capacity, and a certificate that has expired — because everything else here
 * is administration and those two are the reasons a child is left at the gate
 * or a bus is impounded at a checkpoint.
 */
export default async function TransportPage() {
  const user = await requirePermission("transport.read");

  // Staff only. transport.read is held by pupils and parents so that
  // /portal/student/transport and /portal/guardian/transport work — and
  // without this line that same permission opened this page, which lists
  // every child on every route by name, with the handover notes. The manifest
  // endpoint takes transport.manage for exactly this reason; the page it
  // prints from was still on read. Same guard as src/app/(app)/lms/page.tsx.
  if (user.portal !== "STAFF") notFound();

  const canManage = userCan(user, "transport.manage");

  const [routes, vehicles, staff, unassignedBusChildren] = await Promise.all([
    db.transportRoute.findMany({
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        feeMinor: true,
        durationMins: true,
        stops: { select: { id: true } },
        vehicles: { select: { capacity: true, isActive: true } },
        assignments: { where: { endedOn: null }, select: { direction: true } },
      },
    }),
    db.transportVehicle.findMany({
      orderBy: [{ isActive: "desc" }, { registration: "asc" }],
      select: {
        id: true,
        registration: true,
        make: true,
        capacity: true,
        isActive: true,
        driverName: true,
        driverPhone: true,
        roadworthyExpiry: true,
        insuranceExpiry: true,
        route: { select: { id: true, code: true, name: true } },
        driverStaff: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    canManage
      ? db.staff.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: { id: true, firstName: true, lastName: true, jobTitle: true },
          take: 500,
        })
      : Promise.resolve([]),
    // Children the record says come by school bus who are not on any route —
    // the gap between what admission wrote down and what the office arranged.
    db.student.count({
      where: {
        status: "ENROLLED",
        transportMode: "SCHOOL_BUS",
        transport: { none: { endedOn: null } },
      },
    }),
  ]);

  const now = new Date();
  const overCapacity = routes.filter(
    (route) => route.isActive && capacityOf(route.vehicles, route.assignments).over,
  );
  const grounded = vehicles.filter((vehicle) => fitnessOf(vehicle, now).grounded);
  const riding = routes.reduce(
    (sum, route) => sum + route.assignments.length,
    0,
  );

  return (
    <div>
      <PageHeader
        title="Transport"
        description="Routes, buses, and which child stands at which stop."
      />

      {overCapacity.length ? (
        <Alert tone="danger" title="A route has more children than seats" className="mb-4">
          {overCapacity.map((route) => `${route.code} (${route.name})`).join(", ")} —
          add a bus or move children to another route. The manifest will print
          every name either way.
        </Alert>
      ) : null}

      {grounded.length ? (
        <Alert tone="danger" title="A bus should not be on the road" className="mb-4">
          {grounded
            .map(
              (vehicle) =>
                `${vehicle.registration} (${fitnessOf(vehicle, now).reasons.join(", ").toLowerCase()})`,
            )
            .join(", ")}
          .
        </Alert>
      ) : null}

      {unassignedBusChildren ? (
        <Alert tone="warning" className="mb-4">
          {unassignedBusChildren} child{unassignedBusChildren === 1 ? "" : "ren"} recorded
          as travelling by school bus {unassignedBusChildren === 1 ? "is" : "are"} not on
          any route.
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Routes"
          value={routes.filter((route) => route.isActive).length}
          hint="Running"
          icon={<RouteIcon className="size-4" />}
          tone="info"
        />
        <StatCard
          label="Buses"
          value={vehicles.filter((vehicle) => vehicle.isActive).length}
          hint="In service"
          icon={<Bus className="size-4" />}
          tone="violet"
        />
        <StatCard
          label="Children riding"
          value={riding}
          hint="Standing arrangements"
          icon={<Users className="size-4" />}
          tone="neutral"
        />
        <StatCard
          label="Needs attention"
          value={overCapacity.length + grounded.length}
          hint={
            overCapacity.length + grounded.length
              ? "Capacity or certificates"
              : "Nothing outstanding"
          }
          icon={<AlertTriangle className="size-4" />}
          tone={overCapacity.length + grounded.length ? "danger" : "success"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader
              title="Routes"
              description="Seats counted for the busier of the two runs."
            />
            {routes.length === 0 ? (
              <EmptyState
                icon={<RouteIcon className="size-6" />}
                title="No routes yet"
                description={
                  canManage
                    ? "Add the first route beside this, with its stops."
                    : "Nothing has been set up yet."
                }
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {routes.map((route) => {
                  const seating = capacityOf(route.vehicles, route.assignments);
                  return (
                    <li key={route.id} className="flex flex-wrap gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/transport/${route.id}`}
                            className="font-medium hover:text-[var(--primary)]"
                          >
                            {route.code} — {route.name}
                          </Link>
                          {route.isActive ? null : (
                            <Badge tone="neutral">Not running</Badge>
                          )}
                          {seating.over ? <Badge tone="danger">Over capacity</Badge> : null}
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {route.stops.length} stop{route.stops.length === 1 ? "" : "s"}
                          {" · "}
                          {route.vehicles.length} bus
                          {route.vehicles.length === 1 ? "" : "es"}
                          {route.durationMins ? ` · about ${route.durationMins} min` : ""}
                          {route.feeMinor ? ` · ${formatMoney(route.feeMinor)} a term` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <p className="numeric font-medium">
                          {seating.peak} / {seating.seats} seats
                        </p>
                        <p className="numeric text-[var(--text-subtle)]">
                          {seating.morning} am · {seating.afternoon} pm
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Buses" description="Roadworthy and insurance are what ground one." />
            {vehicles.length === 0 ? (
              <EmptyState
                icon={<Bus className="size-6" />}
                title="No buses yet"
                description={canManage ? "Add one beside this." : "Nothing has been added yet."}
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {vehicles.map((vehicle) => {
                  const fitness = fitnessOf(vehicle, now);
                  const driver = vehicle.driverStaff
                    ? `${vehicle.driverStaff.firstName} ${vehicle.driverStaff.lastName}`
                    : vehicle.driverName;
                  return (
                    <li key={vehicle.id} className="flex flex-wrap gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {canManage ? (
                            <Link
                              href={`/transport/vehicles/${vehicle.id}`}
                              className="numeric font-medium hover:text-[var(--primary)]"
                            >
                              {vehicle.registration}
                            </Link>
                          ) : (
                            <span className="numeric font-medium">
                              {vehicle.registration}
                            </span>
                          )}
                          {vehicle.make ? (
                            <span className="text-xs text-[var(--text-subtle)]">
                              {vehicle.make}
                            </span>
                          ) : null}
                          {fitness.grounded ? (
                            <Badge tone="danger">Do not run</Badge>
                          ) : fitness.reasons.length ? (
                            <Badge tone="warning">{fitness.reasons[0]}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {vehicle.route ? (
                            <Link
                              href={`/transport/${vehicle.route.id}`}
                              className="hover:text-[var(--primary)]"
                            >
                              {vehicle.route.code}
                            </Link>
                          ) : (
                            "No route"
                          )}
                          {" · "}
                          {vehicle.capacity} seats
                          {driver ? ` · ${driver}` : " · no driver recorded"}
                          {vehicle.driverPhone ? ` · ${vehicle.driverPhone}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-[var(--text-subtle)]">
                        {vehicle.roadworthyExpiry ? (
                          <p className="numeric">
                            Roadworthy {formatDate(vehicle.roadworthyExpiry)}
                          </p>
                        ) : null}
                        {vehicle.insuranceExpiry ? (
                          <p className="numeric">
                            Insurance {formatDate(vehicle.insuranceExpiry)}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {canManage ? (
          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Add a route"
                description="One stop per line, with times."
              />
              <RouteForm />
            </Card>
            <Card>
              <CardHeader title="Add a bus" />
              <VehicleForm
                routes={routes.map((route) => ({
                  value: route.id,
                  label: `${route.code} — ${route.name}`,
                }))}
                staff={staff.map((person) => ({
                  value: person.id,
                  label: `${person.firstName} ${person.lastName}`,
                  description: person.jobTitle ?? undefined,
                }))}
              />
            </Card>
            <Card>
              <CardHeader title="Where children stand" />
              <div className="px-5 py-4 text-sm text-[var(--text-muted)]">
                <MapPin className="mb-1 size-4 text-[var(--text-subtle)]" />
                <p>
                  Open a route to see its stops and put children on it. The manifest
                  prints from there.
                </p>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
