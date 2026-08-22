import "server-only";

import { db } from "./db";

/**
 * A boarder's own bed and leave-out, for the portals.
 *
 * Scoped on student ids and nothing else. boarding.read is a staff permission
 * covering every house in the school, and a parent reaching their child's room
 * through it would be reaching everyone's — the same trap the hall list and
 * the exam register were pulled back from. A guardian's page passes the ids
 * from wardIdsFor, which is the same discipline one level out.
 */

export type PortalBed = {
  studentId: string;
  studentName: string;
  houseName: string;
  houseParent: string | null;
  houseParentPhone: string | null;
  roomName: string;
  bedLabel: string | null;
  since: Date;
};

export type PortalExeat = {
  id: string;
  status: string;
  reason: string;
  destination: string;
  departsAt: Date;
  dueBackAt: Date;
  releasedToName: string;
  signedOutAt: Date | null;
  signedInAt: Date | null;
  decisionNote: string | null;
};

export async function boardingFor(studentIds: string[], academicYearId: string) {
  if (studentIds.length === 0) return { beds: [], exeats: new Map<string, PortalExeat[]>() };

  const [allocations, exeats] = await Promise.all([
    db.boardingAllocation.findMany({
      where: { studentId: { in: studentIds }, academicYearId, endedOn: null },
      select: {
        studentId: true,
        bedLabel: true,
        startedOn: true,
        student: { select: { firstName: true, lastName: true, otherNames: true } },
        room: {
          select: {
            name: true,
            house: {
              select: {
                name: true,
                houseParent: {
                  select: { title: true, firstName: true, lastName: true, phone: true },
                },
              },
            },
          },
        },
      },
    }),
    db.boardingExeat.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { departsAt: "desc" },
      take: 40,
      select: {
        id: true,
        studentId: true,
        status: true,
        reason: true,
        destination: true,
        departsAt: true,
        dueBackAt: true,
        releasedToName: true,
        signedOutAt: true,
        signedInAt: true,
        decisionNote: true,
      },
    }),
  ]);

  const beds: PortalBed[] = allocations.map((allocation) => {
    const parent = allocation.room.house.houseParent;
    return {
      studentId: allocation.studentId,
      studentName: [
        allocation.student.firstName,
        allocation.student.otherNames,
        allocation.student.lastName,
      ]
        .filter(Boolean)
        .join(" "),
      houseName: allocation.room.house.name,
      houseParent: parent
        ? [parent.title, parent.firstName, parent.lastName].filter(Boolean).join(" ")
        : null,
      // The number a parent rings at ten at night. It is the one piece of
      // staff contact detail a boarding parent is entitled to, and looking it
      // up in an emergency is exactly when nobody can find it.
      houseParentPhone: parent?.phone ?? null,
      roomName: allocation.room.name,
      bedLabel: allocation.bedLabel,
      since: allocation.startedOn,
    };
  });

  const byStudent = new Map<string, PortalExeat[]>();
  for (const exeat of exeats) {
    const list = byStudent.get(exeat.studentId) ?? [];
    list.push(exeat);
    byStudent.set(exeat.studentId, list);
  }

  return { beds, exeats: byStudent };
}
