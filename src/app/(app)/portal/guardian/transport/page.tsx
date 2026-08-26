import type { Metadata } from "next";
import { Bus, Clock, MapPin, Phone } from "lucide-react";

import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { directionLabel } from "@/lib/transport";
import { listName } from "@/lib/utils";

import { NotLinked } from "../not-linked";
import { wardIdsFor } from "../wards";

export const metadata: Metadata = { title: "School bus" };
export const dynamic = "force-dynamic";

/**
 * Which bus each of this family's children is on.
 *
 * The questions a parent actually has are the stop, the time, and a number to
 * ring when the bus is late — in that order — so those are what the page
 * leads with. Everything about routes and capacity belongs to the office and
 * is not here.
 *
 * Scoped through wardIdsFor like every other guardian page: the children come
 * from the signed-in guardian, never from anything in the URL.
 */
export default async function GuardianTransportPage() {
  const user = await requirePermission("transport.read");

  const guardian = await db.guardian.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!guardian) return <NotLinked title="Guardian Portal" />;

  const wardIds = await wardIdsFor(guardian.id);
  if (wardIds.length === 0) return <NotLinked title="Guardian Portal" />;

  const assignments = await db.transportAssignment.findMany({
    where: { studentId: { in: wardIds }, endedOn: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      direction: true,
      collectedBy: true,
      student: {
        select: { id: true, firstName: true, lastName: true, otherNames: true },
      },
      stop: {
        select: { name: true, landmark: true, pickupTime: true, dropoffTime: true },
      },
      route: {
        select: {
          code: true,
          name: true,
          isActive: true,
          vehicles: {
            where: { isActive: true },
            select: {
              registration: true,
              driverName: true,
              driverPhone: true,
              assistantName: true,
              assistantPhone: true,
              driverStaff: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  return (
    <div>
      <PageHeader
        title="School bus"
        description="Where your children are picked up, and who to ring."
      />

      {assignments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bus className="size-6" />}
            title="Nobody is on a school bus"
            description="If your child should be, speak to the school office."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {assignments.map((assignment) => {
            const bus = assignment.route.vehicles[0];
            const driver = bus?.driverStaff
              ? `${bus.driverStaff.firstName} ${bus.driverStaff.lastName}`
              : bus?.driverName;

            return (
              <Card key={assignment.id}>
                <CardHeader
                  title={listName(assignment.student)}
                  description={`Route ${assignment.route.code}, ${assignment.route.name}`}
                  action={
                    assignment.direction === "BOTH" ? null : (
                      <Badge tone="neutral">{directionLabel(assignment.direction)}</Badge>
                    )
                  }
                />
                <CardBody className="space-y-4">
                  {assignment.route.isActive ? null : (
                    <Alert tone="warning">
                      This route is not running at the moment. The school will be in
                      touch about arrangements.
                    </Alert>
                  )}

                  {assignment.stop ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                          <MapPin className="size-3.5" />
                          Stop
                        </p>
                        <p className="mt-1 text-sm font-medium">{assignment.stop.name}</p>
                        {assignment.stop.landmark ? (
                          <p className="text-xs text-[var(--text-muted)]">
                            {assignment.stop.landmark}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                          <Clock className="size-3.5" />
                          Times
                        </p>
                        <p className="numeric mt-1 text-sm">
                          {assignment.stop.pickupTime
                            ? `Picked up ${assignment.stop.pickupTime}`
                            : "Pick-up time not set"}
                        </p>
                        <p className="numeric text-sm">
                          {assignment.stop.dropoffTime
                            ? `Dropped off ${assignment.stop.dropoffTime}`
                            : "Drop-off time not set"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Alert tone="warning">
                      No stop has been set yet. Please ring the office to arrange where
                      your child is picked up.
                    </Alert>
                  )}

                  {assignment.collectedBy ? (
                    <p className="text-sm">
                      <span className="text-[var(--text-muted)]">Handed over to </span>
                      <strong>{assignment.collectedBy}</strong>
                    </p>
                  ) : null}

                  {bus ? (
                    <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                        <Phone className="size-3.5" />
                        If the bus is late
                      </p>
                      <p className="mt-1.5 text-sm">
                        <span className="numeric font-medium">{bus.registration}</span>
                        {driver ? ` · ${driver}` : ""}
                      </p>
                      {bus.driverPhone ? (
                        <a
                          href={`tel:${bus.driverPhone}`}
                          className="numeric text-sm text-[var(--primary)]"
                        >
                          {bus.driverPhone}
                        </a>
                      ) : null}
                      {bus.assistantName ? (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Assistant: {bus.assistantName}
                          {bus.assistantPhone ? ` · ${bus.assistantPhone}` : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-subtle)]">
                      No bus has been assigned to this route yet.
                    </p>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
