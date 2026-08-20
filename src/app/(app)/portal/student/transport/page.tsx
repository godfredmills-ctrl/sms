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

import { NotLinked } from "../not-linked";

export const metadata: Metadata = { title: "My bus" };
export const dynamic = "force-dynamic";

/**
 * A pupil's own bus.
 *
 * Their own arrangement and nothing else — the student is resolved from the
 * session, never from anything in the URL. It exists because the student role
 * holds transport.read, and a permission with no page behind it is either a
 * mistake or an invitation to wander into the operations pages, which list
 * every child in the school by name.
 */
export default async function StudentTransportPage() {
  const user = await requirePermission("transport.read");

  const student = await db.student.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!student) return <NotLinked />;

  const assignments = await db.transportAssignment.findMany({
    where: { studentId: student.id, endedOn: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      direction: true,
      collectedBy: true,
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
              driverStaff: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  return (
    <div>
      <PageHeader title="My bus" description="Where you are picked up, and when." />

      {assignments.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bus className="size-6" />}
            title="You are not on a school bus"
            description="If you should be, ask at the school office."
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
                  title={`Route ${assignment.route.code} — ${assignment.route.name}`}
                  action={
                    assignment.direction === "BOTH" ? null : (
                      <Badge tone="neutral">{directionLabel(assignment.direction)}</Badge>
                    )
                  }
                />
                <CardBody className="space-y-4">
                  {assignment.route.isActive ? null : (
                    <Alert tone="warning">
                      This route is not running at the moment. The school will let your
                      family know about arrangements.
                    </Alert>
                  )}

                  {assignment.stop ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                          <MapPin className="size-3.5" />
                          Your stop
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
                      Your stop has not been set yet. Ask at the school office.
                    </Alert>
                  )}

                  {assignment.collectedBy ? (
                    <p className="text-sm">
                      <span className="text-[var(--text-muted)]">You are handed over to </span>
                      <strong>{assignment.collectedBy}</strong>
                    </p>
                  ) : null}

                  {bus ? (
                    <div className="rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                        <Phone className="size-3.5" />
                        Your bus
                      </p>
                      <p className="mt-1.5">
                        <span className="numeric font-medium">{bus.registration}</span>
                        {driver ? ` · ${driver}` : ""}
                      </p>
                      {bus.assistantName ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          Assistant: {bus.assistantName}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
