import type { Metadata } from "next";
import Link from "next/link";

import type { SelectOption } from "@/components/select-search";
import { Alert, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { unhoused } from "@/lib/boarding";
import { db } from "@/lib/db";
import { fullName, listName } from "@/lib/utils";

import { HousesEditor, type HouseRow } from "./houses-editor";

export const metadata: Metadata = { title: "Houses & rooms" };
export const dynamic = "force-dynamic";

export default async function HousesPage() {
  await requirePermission("boarding.manage");

  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true },
  });

  if (!year) {
    return (
      <>
        <PageHeader title="Houses &amp; rooms" description="Where boarders sleep." />
        <Alert tone="warning" title="There is no current academic year">
          Beds are allocated for a year. Set one up under{" "}
          <Link href="/academics/years" className="underline">
            Academic years
          </Link>{" "}
          first.
        </Alert>
      </>
    );
  }

  const [houses, staff, waiting, allBoarders] = await Promise.all([
    db.boardingHouse.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        gender: true,
        houseParentId: true,
        assistantId: true,
        colour: true,
        motto: true,
        notes: true,
        active: true,
        houseParent: { select: { title: true, firstName: true, lastName: true } },
        rooms: {
          orderBy: [{ active: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            capacity: true,
            floor: true,
            notes: true,
            active: true,
            allocations: {
              where: { endedOn: null, academicYearId: year.id },
              select: {
                bedLabel: true,
                student: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    otherNames: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.staff.findMany({
      where: { status: { in: ["ACTIVE", "PROBATION"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, title: true, jobTitle: true },
    }),
    unhoused(year.id),
    // Every boarder, not only the ones with no bed. The picker used to offer
    // the unhoused alone, which made the move this page advertises impossible:
    // a child already in a room simply was not in the list, so the only way to
    // move them was to release the bed first and hope nobody took it.
    db.student.findMany({
      where: { status: "ENROLLED", isBoarder: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 2000,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        otherNames: true,
        admissionNo: true,
        boardingAllocations: {
          where: { endedOn: null, academicYearId: year.id },
          take: 1,
          select: {
            bedLabel: true,
            room: { select: { name: true, house: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const rows: HouseRow[] = houses.map((house) => ({
    id: house.id,
    name: house.name,
    code: house.code,
    gender: house.gender,
    houseParentId: house.houseParentId,
    houseParentName: house.houseParent ? fullName(house.houseParent) : null,
    assistantId: house.assistantId,
    colour: house.colour,
    motto: house.motto,
    notes: house.notes,
    active: house.active,
    rooms: house.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      occupied: room.allocations.length,
      floor: room.floor,
      notes: room.notes,
      active: room.active,
      boarders: room.allocations.map((allocation) => ({
        id: allocation.student.id,
        name: listName(allocation.student),
        bedLabel: allocation.bedLabel,
      })),
    })),
  }));

  const staffOptions: SelectOption[] = staff.map((person) => ({
    value: person.id,
    label: fullName(person),
    description: person.jobTitle ?? undefined,
  }));

  // Whoever has no bed first, then the rest — so the common job is at the top
  // of the list and a move is still possible. Where a child already has a bed
  // the picker says which, because allocating them again moves them out of it.
  const describe = (student: (typeof allBoarders)[number]) => {
    const bed = student.boardingAllocations[0];
    return (
      [
        student.admissionNo,
        bed
          ? `now in ${bed.room.house.name} · ${bed.room.name}${bed.bedLabel ? ` · ${bed.bedLabel}` : ""}`
          : "no bed",
      ]
        .filter(Boolean)
        .join(" · ") || undefined
    );
  };

  const unplaced: SelectOption[] = [
    ...allBoarders.filter((student) => student.boardingAllocations.length === 0),
    ...allBoarders.filter((student) => student.boardingAllocations.length > 0),
  ].map((student) => ({
    value: student.id,
    label: listName(student),
    description: describe(student),
  }));

  return (
    <>
      <PageHeader
        title="Houses &amp; rooms"
        description={`${year.name}. A room's capacity is beds: the free-text fields this replaced could say thirty children were in a room that sleeps eight, because nothing counted.`}
      />
      {waiting.length ? (
        <Alert tone="info" className="mb-4">
          {waiting.length} boarder{waiting.length === 1 ? " has" : "s have"} no bed. They
          are listed first when you allocate. A child already in a room is moved by
          allocating them again, which closes the old row rather than deleting it: the
          picker says where each one is now.
        </Alert>
      ) : null}
      <HousesEditor houses={rows} staff={staffOptions} unplaced={unplaced} />
    </>
  );
}
