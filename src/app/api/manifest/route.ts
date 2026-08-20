import { NextResponse } from "next/server";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { renderManifestPdf, type ManifestChild } from "@/lib/manifest-pdf";
import { fitnessOf, travelsOn } from "@/lib/transport";
import { listName } from "@/lib/utils";

/**
 * The bus manifest as a printable sheet.
 *
 * `?route=<id>&run=morning|afternoon`. Rendered on request, never stored: the
 * list changes the day a child joins or leaves a route, and a stored sheet
 * would go stale silently — which for this document means a child on the bus
 * who is not on the paper.
 */
export const dynamic = "force-dynamic";

function message(status: number, title: string, body: string) {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#111">
<h1 style="font-size:1.1rem">${escape(title)}</h1><p style="color:#555;line-height:1.5">${escape(body)}</p>
</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  // transport.manage, not transport.read.
  //
  // read is held by teachers, pupils and parents so they can see which bus a
  // child is on — and this sheet is a different thing entirely: every child on
  // the route by name, their class, who collects them, and a guardian's phone
  // number beside each one. Gated on read, any pupil with a route id could
  // have pulled the contact details of everyone on their bus. It is the
  // office's document, printed and handed to a driver.
  try {
    await authorize("transport.manage");
  } catch (error) {
    return message(403, "Not signed in for this", (error as Error).message);
  }

  const url = new URL(request.url);
  const routeId = url.searchParams.get("route");
  if (!routeId) return message(400, "Which route?", "No route was given to print.");

  const run = url.searchParams.get("run") === "afternoon" ? "AFTERNOON" : "MORNING";

  const [route, school] = await Promise.all([
    db.transportRoute.findUnique({
      where: { id: routeId },
      select: {
        code: true,
        name: true,
        stops: { orderBy: { sequence: "asc" }, select: { id: true, name: true, landmark: true, pickupTime: true, dropoffTime: true } },
        vehicles: {
          // Every bus on the route, not only the ones in service: a grounded
          // bus that is still assigned is exactly what the sheet must say.
          select: {
            registration: true,
            isActive: true,
            roadworthyExpiry: true,
            insuranceExpiry: true,
            driverName: true,
            driverPhone: true,
            assistantName: true,
            assistantPhone: true,
            driverStaff: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        assignments: {
          where: { endedOn: null },
          select: {
            direction: true,
            stopId: true,
            collectedBy: true,
            notes: true,
            student: {
              select: {
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
                guardians: {
                  orderBy: [{ isPrimary: "desc" }, { sortKey: "asc" }],
                  take: 1,
                  select: {
                    guardian: { select: { firstName: true, lastName: true, phone: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.school.findFirst({ select: { name: true, phone: true } }),
  ]);

  if (!route) return message(404, "Route not found", "No route has that id.");

  const travelling = route.assignments.filter((entry) => travelsOn(entry.direction, run));

  const toChild = (entry: (typeof travelling)[number]): ManifestChild => {
    const section = entry.student.enrollments[0]?.classSection;
    const guardian = entry.student.guardians[0]?.guardian;
    return {
      name: listName(entry.student),
      admissionNo: entry.student.admissionNo,
      className: section ? `${section.classLevel.name} ${section.name}` : "—",
      collectedBy: entry.collectedBy,
      guardianName: guardian ? `${guardian.firstName} ${guardian.lastName}` : null,
      guardianPhone: guardian?.phone ?? null,
      notes: entry.notes,
    };
  };

  const byStop = new Map<string, ManifestChild[]>();
  const unplaced: ManifestChild[] = [];

  for (const entry of travelling) {
    if (!entry.stopId) {
      unplaced.push(toChild(entry));
      continue;
    }
    const list = byStop.get(entry.stopId);
    if (list) list.push(toChild(entry));
    else byStop.set(entry.stopId, [toChild(entry)]);
  }

  const sortByName = (children: ManifestChild[]) =>
    [...children].sort((a, b) => a.name.localeCompare(b.name));

  const pdf = await renderManifestPdf({
    school: { name: school?.name ?? "School", phone: school?.phone ?? null },
    route: { code: route.code, name: route.name },
    run,
    printedOn: new Date(),
    vehicles: route.vehicles.map((vehicle) => ({
      registration: vehicle.registration,
      grounded: fitnessOf(vehicle).grounded
        ? fitnessOf(vehicle).reasons.join(", ").toLowerCase()
        : null,
      driver: vehicle.driverStaff
        ? `${vehicle.driverStaff.firstName} ${vehicle.driverStaff.lastName}`
        : vehicle.driverName,
      driverPhone: vehicle.driverPhone ?? vehicle.driverStaff?.phone ?? null,
      assistant: vehicle.assistantName,
      assistantPhone: vehicle.assistantPhone,
    })),
    // Afternoon runs the stops in the same order with the drop-off times: a
    // school bus in Accra retraces its morning route rather than reversing
    // it, because the roads are one-way in practice if not on paper.
    stops: route.stops.map((stop) => ({
      name: stop.name,
      landmark: stop.landmark,
      time: run === "MORNING" ? stop.pickupTime : stop.dropoffTime,
      children: sortByName(byStop.get(stop.id) ?? []),
    })),
    unplaced: sortByName(unplaced),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="manifest-${route.code}-${run.toLowerCase()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
