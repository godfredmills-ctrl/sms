import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Bus, MapPin, Printer, Users } from "lucide-react";

import type { SelectOption } from "@/components/select-search";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { requirePermission, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { capacityOf, directionLabel, fitnessOf, travelsOn } from "@/lib/transport";
import { listName } from "@/lib/utils";

import { RouteForm } from "../forms";
import { AssignForm, EndAssignmentButton } from "./assign-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const route = await db.transportRoute.findUnique({
    where: { id },
    select: { code: true, name: true },
  });
  return { title: route ? `${route.code}, ${route.name}` : "Route" };
}

/**
 * One route: its stops, its buses, and the children on it.
 *
 * Laid out as the manifest is laid out — by stop, in the order the bus
 * reaches them — so the screen and the printed sheet tell the same story.
 * Children with no stop recorded get their own group at the end rather than
 * being left out of both, because that child is exactly the one who gets
 * missed.
 */
export default async function RoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const user = await requirePermission("transport.read");

  // Staff only. transport.read is held by pupils and parents so that
  // /portal/student/transport and /portal/guardian/transport work — and
  // without this line that same permission opened this page, which lists
  // every child on every route by name, with the handover notes. The manifest
  // endpoint takes transport.manage for exactly this reason; the page it
  // prints from was still on read. Same guard as src/app/(app)/lms/page.tsx.
  if (user.portal !== "STAFF") notFound();

  const canManage = userCan(user, "transport.manage");

  const { id } = await params;
  const { run: runParam } = await searchParams;
  const run = runParam === "afternoon" ? "AFTERNOON" : "MORNING";

  const route = await db.transportRoute.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isActive: true,
      feeMinor: true,
      durationMins: true,
      stops: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          name: true,
          landmark: true,
          pickupTime: true,
          dropoffTime: true,
        },
      },
      vehicles: {
        select: {
          id: true,
          registration: true,
          capacity: true,
          isActive: true,
          driverName: true,
          driverPhone: true,
          assistantName: true,
          roadworthyExpiry: true,
          insuranceExpiry: true,
          driverStaff: { select: { firstName: true, lastName: true } },
        },
      },
      assignments: {
        where: { endedOn: null },
        select: {
          id: true,
          direction: true,
          stopId: true,
          collectedBy: true,
          notes: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              otherNames: true,
              admissionNo: true,
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
        },
      },
    },
  });

  if (!route) notFound();

  // Only children who need a seat on this run. BOTH counts for each — the rule
  // lives in lib/transport.ts so this page and the manifest cannot disagree.
  const travelling = route.assignments.filter((entry) => travelsOn(entry.direction, run));

  // Sorted by name, as the manifest sorts them — two lists of the same
  // children in different orders is how someone ticks the wrong row.
  const ordered = [...travelling].sort((a, b) =>
    listName(a.student).localeCompare(listName(b.student)),
  );

  const byStop = new Map<string, typeof travelling>();
  const unplaced: typeof travelling = [];
  for (const entry of ordered) {
    if (!entry.stopId) {
      unplaced.push(entry);
      continue;
    }
    const list = byStop.get(entry.stopId);
    if (list) list.push(entry);
    else byStop.set(entry.stopId, [entry]);
  }

  const seating = capacityOf(route.vehicles, route.assignments);
  const now = new Date();
  const grounded = route.vehicles.filter((vehicle) => fitnessOf(vehicle, now).grounded);

  const students: SelectOption[] = canManage
    ? (
        await db.student.findMany({
          where: { status: "ENROLLED" },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: 2000,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            otherNames: true,
            admissionNo: true,
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
        })
      ).map((student) => {
        const section = student.enrollments[0]?.classSection;
        return {
          value: student.id,
          label: listName(student),
          description: [
            student.admissionNo,
            section ? `${section.classLevel.name} ${section.name}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        };
      })
    : [];

  const runs = [
    { key: "morning", label: "Morning" },
    { key: "afternoon", label: "Afternoon" },
  ];

  return (
    <div>
      <PageHeader
        title={`${route.code}, ${route.name}`}
        description={
          [
            route.description,
            route.durationMins ? `about ${route.durationMins} minutes` : null,
            route.feeMinor ? `${formatMoney(route.feeMinor)} a term` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "A school bus route."
        }
        breadcrumb={
          <Link href="/transport" className="hover:text-[var(--text)]">
            Transport
          </Link>
        }
        action={
          // Shown only to the people the manifest is for. It carries every
          // child's guardian phone number, and transport.read reaches parents
          // and pupils so they can see which bus they are on.
          canManage ? (
            <>
              <LinkButton
                href={`/api/manifest?route=${route.id}&run=morning`}
                target="_blank"
                size="sm"
                variant="secondary"
              >
                <Printer className="size-4" />
                Morning manifest
              </LinkButton>
              <LinkButton
                href={`/api/manifest?route=${route.id}&run=afternoon`}
                target="_blank"
                size="sm"
                variant="secondary"
              >
                <Printer className="size-4" />
                Afternoon
              </LinkButton>
            </>
          ) : null
        }
      />

      {route.isActive ? null : (
        <Alert tone="warning" className="mb-4">
          This route is not running. Children on it keep their places, and the
          manifest still prints.
        </Alert>
      )}

      {seating.over ? (
        <Alert tone="danger" title="More children than seats" className="mb-4">
          {seating.peak} children need a seat at the busiest run and the buses on this
          route hold {seating.seats}. Add a bus, or move someone to another route.
        </Alert>
      ) : null}

      {grounded.length ? (
        <Alert tone="danger" title="A bus on this route should not run" className="mb-4">
          {grounded
            .map(
              (vehicle) =>
                `${vehicle.registration}, ${fitnessOf(vehicle, now).reasons.join(", ").toLowerCase()}`,
            )
            .join("; ")}
          .
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="On this run"
          value={travelling.length}
          hint={run === "MORNING" ? "Morning" : "Afternoon"}
          icon={<Users className="size-4" />}
          tone="info"
        />
        <StatCard
          label="Seats"
          value={seating.seats}
          hint={`${seating.morning} am · ${seating.afternoon} pm`}
          icon={<Bus className="size-4" />}
          tone={seating.over ? "danger" : "success"}
        />
        <StatCard
          label="Stops"
          value={route.stops.length}
          hint="On the route"
          icon={<MapPin className="size-4" />}
          tone="violet"
        />
        <StatCard
          label="No stop set"
          value={unplaced.length}
          hint={unplaced.length ? "Fix before the bus leaves" : "Everyone placed"}
          icon={<AlertTriangle className="size-4" />}
          tone={unplaced.length ? "warning" : "neutral"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="mb-3 flex gap-1.5">
            {runs.map((option) => (
              <Link
                key={option.key}
                href={`/transport/${route.id}?run=${option.key}`}
                aria-current={
                  (option.key === "morning") === (run === "MORNING") ? "page" : undefined
                }
                className={
                  (option.key === "morning") === (run === "MORNING")
                    ? "rounded-full bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white"
                    : "rounded-full px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
                }
              >
                {option.label}
              </Link>
            ))}
          </div>

          <Card>
            <CardHeader
              title="Who is on the bus"
              description="Grouped by stop, in the order the bus reaches them."
            />

            {route.stops.length === 0 && unplaced.length === 0 ? (
              <EmptyState
                icon={<MapPin className="size-6" />}
                title="No stops on this route"
                description="Edit the route from the transport page to add its stops."
              />
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {route.stops.map((stop) => {
                  const children = byStop.get(stop.id) ?? [];
                  const time = run === "MORNING" ? stop.pickupTime : stop.dropoffTime;
                  return (
                    <div key={stop.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">
                          {time ? (
                            <span className="numeric mr-2 text-[var(--primary)]">{time}</span>
                          ) : null}
                          {stop.name}
                          {stop.landmark ? (
                            <span className="ml-2 text-xs font-normal text-[var(--text-subtle)]">
                              {stop.landmark}
                            </span>
                          ) : null}
                        </p>
                        <span className="numeric text-xs text-[var(--text-muted)]">
                          {children.length}
                        </span>
                      </div>

                      {children.length === 0 ? (
                        <p className="mt-1 text-xs text-[var(--text-subtle)]">
                          Nobody at this stop on this run.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {children.map((entry) => {
                            const section = entry.student.enrollments[0]?.classSection;
                            return (
                              <li
                                key={entry.id}
                                className="flex flex-wrap items-center gap-2 text-sm"
                              >
                                <Link
                                  href={`/students/${entry.student.id}`}
                                  className="font-medium hover:text-[var(--primary)]"
                                >
                                  {listName(entry.student)}
                                </Link>
                                <span className="text-xs text-[var(--text-muted)]">
                                  {section
                                    ? `${section.classLevel.name} ${section.name}`
                                    : entry.student.admissionNo}
                                </span>
                                {entry.direction === "BOTH" ? null : (
                                  <Badge tone="neutral">
                                    {directionLabel(entry.direction)}
                                  </Badge>
                                )}
                                {entry.collectedBy ? (
                                  <span className="text-xs text-[var(--warning)]">
                                    Hand to {entry.collectedBy}
                                  </span>
                                ) : null}
                                {canManage ? (
                                  <EndAssignmentButton
                                    id={entry.id}
                                    name={entry.student.firstName}
                                  />
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}

                {unplaced.length ? (
                  <div className="bg-[var(--warning-soft)] px-4 py-3">
                    <p className="text-sm font-medium text-[var(--warning)]">
                      No stop recorded: {unplaced.length}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      They are on the route and will print on the manifest, but the
                      driver has nowhere to collect them.
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {unplaced.map((entry) => (
                        <li key={entry.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <Link
                            href={`/students/${entry.student.id}`}
                            className="font-medium hover:text-[var(--primary)]"
                          >
                            {listName(entry.student)}
                          </Link>
                          <span className="text-xs text-[var(--text-muted)]">
                            {entry.student.admissionNo}
                          </span>
                          {canManage ? (
                            <EndAssignmentButton
                              id={entry.id}
                              name={entry.student.firstName}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {canManage ? (
            <Card>
              <CardHeader
                title="Edit this route"
                description="Re-listing the stops updates their times and order."
              />
              <RouteForm
                route={{
                  id: route.id,
                  code: route.code,
                  name: route.name,
                  description: route.description,
                  durationMins: route.durationMins,
                  feeMinor: route.feeMinor,
                  // Rendered back into the one-per-line format the form reads,
                  // so a stop is corrected rather than re-typed from memory.
                  stopsText: route.stops
                    .map((stop) =>
                      [stop.name, stop.landmark, stop.pickupTime, stop.dropoffTime]
                        .map((part) => part ?? "")
                        .join(" | ")
                        .replace(/(\s*\|\s*)+$/, ""),
                    )
                    .join("\n"),
                }}
              />
            </Card>
          ) : null}

          {canManage ? (
            <Card>
              <CardHeader title="Put a child on this route" />
              <AssignForm
                routeId={route.id}
                students={students}
                stops={route.stops.map((stop) => ({
                  value: stop.id,
                  label: stop.name,
                  description: stop.landmark ?? undefined,
                }))}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Buses on this route" />
            {route.vehicles.length === 0 ? (
              <EmptyState
                icon={<Bus className="size-6" />}
                title="No bus assigned"
                description="Nobody can be put on this route until it has one."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {route.vehicles.map((vehicle) => {
                  const fitness = fitnessOf(vehicle, now);
                  const driver = vehicle.driverStaff
                    ? `${vehicle.driverStaff.firstName} ${vehicle.driverStaff.lastName}`
                    : vehicle.driverName;
                  return (
                    <li key={vehicle.id} className="px-5 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="numeric font-medium">{vehicle.registration}</span>
                        <span className="text-xs text-[var(--text-subtle)]">
                          {vehicle.capacity} seats
                        </span>
                        {fitness.grounded ? <Badge tone="danger">Do not run</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {driver ?? "No driver recorded"}
                        {vehicle.driverPhone ? ` · ${vehicle.driverPhone}` : ""}
                        {vehicle.assistantName ? ` · assistant ${vehicle.assistantName}` : ""}
                      </p>
                      {fitness.reasons.length ? (
                        <p className="mt-0.5 text-xs text-[var(--danger)]">
                          {fitness.reasons.join(" · ")}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
