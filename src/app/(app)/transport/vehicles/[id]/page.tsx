import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bus } from "lucide-react";

import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fitnessOf } from "@/lib/transport";
import { formatDate } from "@/lib/utils";

import { VehicleForm } from "../../forms";
import { ServiceToggle } from "./service-toggle";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const vehicle = await db.transportVehicle.findUnique({
    where: { id },
    select: { registration: true },
  });
  return { title: vehicle?.registration ?? "Bus" };
}

/** "2027-03-14" for a date input, or empty. */
function asDateInput(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

/**
 * One bus.
 *
 * This page exists because there was no way to change anything about a bus
 * after it was added. That is a real failure and not a missing convenience: a
 * roadworthy certificate expires, the bus goes in, it comes back renewed —
 * and with nowhere to record the new date, the "should not be on the road"
 * banner on the transport page could never be cleared, so within a year every
 * bus would be showing a warning nobody could act on and everyone would learn
 * to ignore it.
 */
export default async function VehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("transport.manage");
  if (user.portal !== "STAFF") notFound();

  const { id } = await params;

  const [vehicle, routes, staff] = await Promise.all([
    db.transportVehicle.findUnique({
      where: { id },
      select: {
        id: true,
        registration: true,
        make: true,
        capacity: true,
        routeId: true,
        isActive: true,
        notes: true,
        driverStaffId: true,
        driverName: true,
        driverPhone: true,
        assistantName: true,
        assistantPhone: true,
        roadworthyExpiry: true,
        insuranceExpiry: true,
        route: { select: { id: true, code: true, name: true } },
      },
    }),
    db.transportRoute.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.staff.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, jobTitle: true },
    }),
  ]);

  if (!vehicle) notFound();

  const fitness = fitnessOf(vehicle);

  return (
    <div>
      <PageHeader
        title={vehicle.registration}
        description={
          [vehicle.make, `${vehicle.capacity} seats`, vehicle.route?.code]
            .filter(Boolean)
            .join(" · ")
        }
        breadcrumb={
          <Link href="/transport" className="hover:text-[var(--text)]">
            Transport
          </Link>
        }
        action={<ServiceToggle id={vehicle.id} isActive={vehicle.isActive} />}
      />

      {vehicle.isActive ? null : (
        <Alert tone="warning" className="mb-4">
          This bus is off the road. Its seats are not counted towards any route&rsquo;s
          capacity, and children already on that route stay where they are.
        </Alert>
      )}

      {fitness.reasons.length ? (
        <Alert
          tone={fitness.grounded ? "danger" : "warning"}
          title={fitness.grounded ? "Should not be on the road" : "Coming up"}
          className="mb-4"
        >
          {fitness.reasons.join(" · ")}.
          {vehicle.roadworthyExpiry
            ? ` Roadworthy ${formatDate(vehicle.roadworthyExpiry)}.`
            : ""}
          {vehicle.insuranceExpiry
            ? ` Insurance ${formatDate(vehicle.insuranceExpiry)}.`
            : ""}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <Card>
          <CardHeader title="Details" description="Renew a certificate here." />
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
            vehicle={{
              id: vehicle.id,
              registration: vehicle.registration,
              make: vehicle.make,
              capacity: vehicle.capacity,
              routeId: vehicle.routeId,
              driverStaffId: vehicle.driverStaffId,
              driverName: vehicle.driverName,
              driverPhone: vehicle.driverPhone,
              assistantName: vehicle.assistantName,
              assistantPhone: vehicle.assistantPhone,
              roadworthyExpiry: asDateInput(vehicle.roadworthyExpiry),
              insuranceExpiry: asDateInput(vehicle.insuranceExpiry),
            }}
          />
        </Card>

        <Card className="self-start">
          <CardHeader title="Where it runs" />
          <CardBody className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <Bus className="size-4 shrink-0 text-[var(--text-subtle)]" />
              {vehicle.route ? (
                <Link
                  href={`/transport/${vehicle.route.id}`}
                  className="text-[var(--primary)]"
                >
                  {vehicle.route.code} — {vehicle.route.name}
                </Link>
              ) : (
                <span className="text-[var(--text-muted)]">
                  Not on a route. Its seats count towards nothing until it is.
                </span>
              )}
            </p>
            {vehicle.notes ? (
              <p className="text-xs text-[var(--text-muted)]">{vehicle.notes}</p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
