"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { normalisePhone } from "@/lib/utils";
import { capacityOf, conflictingDirections, DIRECTIONS } from "@/lib/transport";

export type TransportState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalDate(formData: FormData, key: string): Date | null {
  const raw = text(formData, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "06:40". Anything else is stored as nothing rather than as itself. */
function optionalTime(formData: FormData, key: string): string | null {
  const raw = text(formData, key);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null;
}

// -----------------------------------------------------------------------------
// Routes and stops
// -----------------------------------------------------------------------------

/**
 * Creates or edits a route, with its stops.
 *
 * Stops come in as lines — "Spintex Junction | opposite the Total | 06:40 |
 * 15:40" — because a route is a list and typing a list is how a list gets
 * entered. Existing stops are matched by name so re-saving a route adjusts
 * times rather than duplicating every stop, and a stop that disappears from
 * the list is kept if any child stands at it: deleting it would strand them.
 */
export async function saveRouteAction(
  _previous: TransportState,
  formData: FormData,
): Promise<TransportState> {
  let user;
  try {
    user = await authorize("transport.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const code = text(formData, "code").toUpperCase();
  const name = text(formData, "name");

  if (!code) return { error: "Give the route a short code — R3, Airport." };
  if (!name) return { error: "What is the route called?" };

  const clash = await db.transportRoute.findUnique({
    where: { code },
    select: { id: true },
  });
  if (clash && clash.id !== id) {
    return { error: `Another route already uses the code ${code}.` };
  }

  const data = {
    code,
    name,
    description: text(formData, "description") || null,
    durationMins: text(formData, "durationMins")
      ? Math.max(0, Math.trunc(Number(text(formData, "durationMins"))) || 0)
      : null,
    feeMinor: text(formData, "fee") ? toMinor(text(formData, "fee")) : null,
  };

  const route = id
    ? await db.transportRoute.update({ where: { id }, data, select: { id: true } })
    : await db.transportRoute.create({ data, select: { id: true } });

  const lines = text(formData, "stops")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length) {
    const existing = await db.transportStop.findMany({
      where: { routeId: route.id },
      select: { id: true, name: true },
    });
    const byName = new Map(existing.map((stop) => [stop.name.toLowerCase(), stop.id]));

    let sequence = 0;
    for (const line of lines) {
      const [stopName, landmark, pickup, dropoff] = line
        .split("|")
        .map((part) => part.trim());
      if (!stopName) continue;
      sequence += 1;

      const fields = {
        name: stopName,
        landmark: landmark || null,
        pickupTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(pickup ?? "") ? pickup : null,
        dropoffTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(dropoff ?? "") ? dropoff : null,
        sequence,
      };

      const match = byName.get(stopName.toLowerCase());
      if (match) {
        await db.transportStop.update({ where: { id: match }, data: fields });
        byName.delete(stopName.toLowerCase());
      } else {
        await db.transportStop.create({ data: { routeId: route.id, ...fields } });
      }
    }

    // Whatever is left was not in the list this time. Removing it is only safe
    // when nobody stands there; otherwise it is kept and pushed to the end,
    // because a child whose stop vanished has nowhere to be picked up.
    for (const [, stopId] of byName) {
      const waiting = await db.transportAssignment.count({
        where: { stopId, endedOn: null },
      });
      if (waiting === 0) {
        await db.transportStop.delete({ where: { id: stopId } });
      } else {
        await db.transportStop.update({
          where: { id: stopId },
          data: { sequence: 999 },
        });
      }
    }
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "transport.route.update" : "transport.route.create",
      entity: "TransportRoute",
      entityId: route.id,
      summary: `${id ? "Edited" : "Created"} route ${code} — ${name}`,
    },
  });

  revalidatePath("/transport");
  revalidatePath(`/transport/${route.id}`);
  return { ok: true, message: id ? "Route updated." : "Route created." };
}

// -----------------------------------------------------------------------------
// Vehicles
// -----------------------------------------------------------------------------

/** Adds or edits a bus. */
export async function saveVehicleAction(
  _previous: TransportState,
  formData: FormData,
): Promise<TransportState> {
  let user;
  try {
    user = await authorize("transport.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  // Plates are written a dozen ways; stored one way so two entries of the same
  // bus cannot both exist.
  const registration = text(formData, "registration").toUpperCase().replace(/\s+/g, " ");
  if (!registration) return { error: "What is the registration number?" };

  const capacity = Math.trunc(Number(text(formData, "capacity")) || 0);
  if (capacity < 1 || capacity > 100) {
    return { error: "How many children does it seat? Somewhere between 1 and 100." };
  }

  const clash = await db.transportVehicle.findUnique({
    where: { registration },
    select: { id: true },
  });
  if (clash && clash.id !== id) {
    return { error: `${registration} is already on the list.` };
  }

  const routeId = text(formData, "routeId") || null;
  if (routeId) {
    const route = await db.transportRoute.findUnique({
      where: { id: routeId },
      select: { id: true },
    });
    if (!route) return { error: "That route was not found." };
  }

  const driverStaffId = text(formData, "driverStaffId") || null;
  if (driverStaffId) {
    const driver = await db.staff.findUnique({
      where: { id: driverStaffId },
      select: { id: true },
    });
    if (!driver) return { error: "That member of staff was not found." };
  }

  const data = {
    registration,
    make: text(formData, "make") || null,
    capacity,
    routeId,
    driverStaffId,
    driverName: driverStaffId ? null : text(formData, "driverName") || null,
    driverPhone: normalisePhone(text(formData, "driverPhone")),
    assistantName: text(formData, "assistantName") || null,
    assistantPhone: normalisePhone(text(formData, "assistantPhone")),
    roadworthyExpiry: optionalDate(formData, "roadworthyExpiry"),
    insuranceExpiry: optionalDate(formData, "insuranceExpiry"),
    notes: text(formData, "notes") || null,
  };

  const vehicle = id
    ? await db.transportVehicle.update({ where: { id }, data, select: { id: true } })
    : await db.transportVehicle.create({ data, select: { id: true } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "transport.vehicle.update" : "transport.vehicle.create",
      entity: "TransportVehicle",
      entityId: vehicle.id,
      summary: `${id ? "Edited" : "Added"} bus ${registration}`,
    },
  });

  revalidatePath("/transport");
  return { ok: true, message: id ? "Bus updated." : "Bus added." };
}

/** Takes a bus off the road, or puts it back. */
export async function setVehicleActiveAction(formData: FormData): Promise<TransportState> {
  let user;
  try {
    user = await authorize("transport.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "Which bus?" };
  const active = formData.get("isActive") === "true";

  const vehicle = await db.transportVehicle.update({
    where: { id },
    data: { isActive: active },
    select: { registration: true, routeId: true },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "transport.vehicle.active",
      entity: "TransportVehicle",
      entityId: id,
      summary: `${vehicle.registration} ${active ? "back in service" : "taken off the road"}`,
    },
  });

  revalidatePath("/transport");
  if (vehicle.routeId) revalidatePath(`/transport/${vehicle.routeId}`);
  return { ok: true, message: active ? "Back in service." : "Off the road." };
}

// -----------------------------------------------------------------------------
// Who is on the bus
// -----------------------------------------------------------------------------

/**
 * Puts a child on a route.
 *
 * Refuses rather than warns when the bus is full: a seat that does not exist
 * is not a data-entry preference, and the alternative is a manifest with
 * thirty-one names on a thirty-seat bus and a child standing in the aisle on
 * the Spintex Road.
 */
export async function assignTransportAction(
  _previous: TransportState,
  formData: FormData,
): Promise<TransportState> {
  let user;
  try {
    user = await authorize("transport.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = text(formData, "studentId");
  const routeId = text(formData, "routeId");
  const stopId = text(formData, "stopId") || null;
  const direction = text(formData, "direction") || "BOTH";

  if (!studentId) return { error: "Which child?" };
  if (!routeId) return { error: "Which route?" };
  if (!DIRECTIONS.some((entry) => entry.value === direction)) {
    return { error: "Morning, afternoon, or both — pick one." };
  }

  const [student, route] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true },
    }),
    db.transportRoute.findUnique({
      where: { id: routeId },
      select: {
        id: true,
        code: true,
        isActive: true,
        stops: { select: { id: true } },
        vehicles: { select: { capacity: true, isActive: true } },
        assignments: { where: { endedOn: null }, select: { direction: true } },
      },
    }),
  ]);

  if (!student) return { error: "That child was not found." };
  if (!route) return { error: "That route was not found." };
  if (!route.isActive) return { error: `Route ${route.code} is not running.` };

  // A stop from another route would print the child in a place the bus never
  // goes. The trigger in the migration is the backstop; this is the message.
  if (stopId && !route.stops.some((stop) => stop.id === stopId)) {
    return { error: "That stop is not on this route." };
  }

  const live = await db.transportAssignment.findMany({
    where: { studentId, endedOn: null },
    select: { id: true, direction: true, route: { select: { code: true } } },
  });

  const blocked = conflictingDirections(direction);
  const conflict = live.find((entry) => blocked.includes(entry.direction));
  if (conflict) {
    return {
      error: `${student.firstName} is already on route ${conflict.route.code} (${conflict.direction.toLowerCase()}). End that first.`,
    };
  }

  // Counted with this child added, for the runs this assignment actually
  // affects — a morning-only child does not take an afternoon seat.
  const after = capacityOf(route.vehicles, [...route.assignments, { direction }]);
  if (after.seats === 0) {
    return { error: `Route ${route.code} has no bus assigned to it yet.` };
  }
  if (after.over) {
    return {
      error: `Route ${route.code} seats ${after.seats}; that would make ${after.peak}. Add a bus or use another route.`,
    };
  }

  const assignment = await db.transportAssignment.create({
    data: {
      studentId,
      routeId,
      stopId,
      direction,
      collectedBy: text(formData, "collectedBy") || null,
      notes: text(formData, "notes") || null,
    },
    select: { id: true },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "transport.assign",
      entity: "Student",
      entityId: studentId,
      summary: `${student.firstName} ${student.lastName} onto route ${route.code} (${direction.toLowerCase()})`,
    },
  });

  revalidatePath("/transport");
  revalidatePath(`/transport/${routeId}`);
  revalidatePath(`/students/${studentId}`);

  return { ok: true, message: `${student.firstName} is on route ${route.code}.` };
}

/**
 * Takes a child off a route.
 *
 * Ends the arrangement rather than deleting it, so "which bus was she on last
 * term" is still answerable — which is the form the question takes when it is
 * asked at all.
 */
export async function endTransportAction(formData: FormData): Promise<TransportState> {
  let user;
  try {
    user = await authorize("transport.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "Which arrangement?" };

  const existing = await db.transportAssignment.findUnique({
    where: { id },
    select: {
      endedOn: true,
      routeId: true,
      studentId: true,
      route: { select: { code: true } },
      student: { select: { firstName: true, lastName: true } },
    },
  });
  if (!existing) return { error: "That arrangement was not found." };
  if (existing.endedOn) {
    revalidatePath(`/transport/${existing.routeId}`);
    return { ok: true, message: "Already ended." };
  }

  await db.transportAssignment.updateMany({
    where: { id, endedOn: null },
    data: { endedOn: new Date() },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "transport.unassign",
      entity: "Student",
      entityId: existing.studentId,
      summary: `${existing.student.firstName} ${existing.student.lastName} off route ${existing.route.code}`,
    },
  });

  revalidatePath("/transport");
  revalidatePath(`/transport/${existing.routeId}`);
  revalidatePath(`/students/${existing.studentId}`);
  return { ok: true, message: "Taken off the route." };
}
