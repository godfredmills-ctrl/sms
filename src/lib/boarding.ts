import "server-only";

import { db } from "./db";
import { bedsFree, houseRefusal } from "./boarding-rules";

/**
 * Boarding: the beds, and who is off the premises.
 *
 * The queries live here rather than in the pages because two of them are asked
 * from more than one place — how full a room is, and where a child currently
 * sleeps — and a second copy of either is a second answer.
 *
 * The rules themselves are in lib/boarding-rules.ts, which the client
 * components import; this module is server-only and cannot be reached from
 * one.
 */

export type RoomOccupancy = {
  roomId: string;
  roomName: string;
  houseId: string;
  houseName: string;
  houseGender: string;
  capacity: number;
  occupied: number;
  free: number;
  active: boolean;
};

/**
 * Every room, with the beds actually taken.
 *
 * Counted from the open allocations, not from a stored number. A stored count
 * is only as true as the last thing that remembered to change it, and the
 * question this answers — is there a bed — is asked while a parent is standing
 * at the desk.
 */
export async function occupancy(academicYearId: string): Promise<RoomOccupancy[]> {
  const rooms = await db.boardingRoom.findMany({
    orderBy: [{ house: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      capacity: true,
      active: true,
      house: { select: { id: true, name: true, gender: true } },
      _count: {
        select: {
          allocations: { where: { endedOn: null, academicYearId } },
        },
      },
    },
  });

  return rooms.map((room) => ({
    roomId: room.id,
    roomName: room.name,
    houseId: room.house.id,
    houseName: room.house.name,
    houseGender: room.house.gender,
    capacity: room.capacity,
    occupied: room._count.allocations,
    free: bedsFree(room.capacity, room._count.allocations),
    active: room.active,
  }));
}

/** Where a child sleeps now, or null if they are not in a bed. */
export async function currentBed(studentId: string, academicYearId: string) {
  return db.boardingAllocation.findFirst({
    where: { studentId, academicYearId, endedOn: null },
    select: {
      id: true,
      bedLabel: true,
      startedOn: true,
      room: {
        select: {
          id: true,
          name: true,
          house: { select: { id: true, name: true, gender: true } },
        },
      },
    },
  });
}

/**
 * Why this child cannot go in this room, or null.
 *
 * Every reason in one place, asked by the page that offers the rooms and again
 * by the action that writes the allocation. The capacity check is racy on its
 * own — two clerks can both read seven of eight — which is why the action
 * re-checks inside its transaction; this is what stops the room being offered
 * in the first place.
 */
export async function allocationRefusal(input: {
  studentId: string;
  roomId: string;
  academicYearId: string;
}): Promise<string | null> {
  const [student, room] = await Promise.all([
    db.student.findUnique({
      where: { id: input.studentId },
      select: { gender: true, status: true, firstName: true, lastName: true },
    }),
    db.boardingRoom.findUnique({
      where: { id: input.roomId },
      select: {
        capacity: true,
        active: true,
        name: true,
        house: { select: { gender: true, active: true, name: true } },
        _count: {
          select: {
            allocations: { where: { endedOn: null, academicYearId: input.academicYearId } },
          },
        },
      },
    }),
  ]);

  if (!student) return "That pupil was not found.";
  if (!room) return "That room was not found.";
  if (student.status !== "ENROLLED") {
    return `${student.firstName} ${student.lastName} is not currently enrolled.`;
  }
  if (!room.active || !room.house.active) {
    return `${room.name} is not in use.`;
  }

  const wrongHouse = houseRefusal(student.gender, room.house.gender);
  if (wrongHouse) return wrongHouse;

  if (room._count.allocations >= room.capacity) {
    return `${room.name} is full — ${room._count.allocations} of ${room.capacity} beds taken.`;
  }

  return null;
}

/**
 * Boarders with no bed.
 *
 * The list somebody works through in the first week of term, and the one that
 * quietly grew when boarding was four text fields: a child marked isBoarder
 * with nothing else filled in was a child the school believed was sleeping
 * somewhere and could not say where.
 */
export async function unhoused(academicYearId: string) {
  return db.student.findMany({
    where: {
      status: "ENROLLED",
      isBoarder: true,
      boardingAllocations: { none: { endedOn: null, academicYearId } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      otherNames: true,
      admissionNo: true,
      gender: true,
      enrollments: {
        where: { status: "ACTIVE", academicYearId },
        take: 1,
        select: {
          classSection: {
            select: { name: true, classLevel: { select: { name: true } } },
          },
        },
      },
    },
  });
}

/**
 * Everyone currently off the premises, worst first.
 *
 * The overdue ones lead, because that is the only reason anybody opens this
 * list in a hurry.
 */
export async function whoIsOut() {
  const out = await db.boardingExeat.findMany({
    where: { status: "OUT" },
    orderBy: { dueBackAt: "asc" },
    select: {
      id: true,
      dueBackAt: true,
      departsAt: true,
      destination: true,
      releasedToName: true,
      releasedToPhone: true,
      signedOutAt: true,
      house: { select: { name: true } },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          otherNames: true,
          admissionNo: true,
        },
      },
    },
  });
  return out;
}
