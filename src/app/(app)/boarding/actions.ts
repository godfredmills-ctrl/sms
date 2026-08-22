"use server";

import { revalidatePath } from "next/cache";

import { authorize, userCan } from "@/lib/auth";
import { allocationRefusal } from "@/lib/boarding";
import { canBecome } from "@/lib/boarding-rules";
import { db } from "@/lib/db";

export type BoardingState = {
  ok?: boolean;
  error?: string;
  message?: string;
  id?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function number(formData: FormData, key: string, fallback: number): number {
  const parsed = Number.parseInt(text(formData, key), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The year everything boarding hangs off. */
async function currentYearId(): Promise<string | null> {
  const year = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  return year?.id ?? null;
}

/** Saves a boarding house. */
export async function saveHouseAction(
  _previous: BoardingState,
  formData: FormData,
): Promise<BoardingState> {
  let user;
  try {
    user = await authorize("boarding.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const name = text(formData, "name");
  if (!name) return { error: "Give the house a name." };

  const gender = ["BOYS", "GIRLS", "MIXED"].includes(text(formData, "gender"))
    ? text(formData, "gender")
    : "MIXED";

  const clash = await db.boardingHouse.findFirst({
    where: { name, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (clash) return { error: `There is already a house called ${name}.` };

  // Changing a house's sex with boarders already in it would leave children
  // sleeping somewhere the rules now forbid, and nothing would say so.
  if (id) {
    const existing = await db.boardingHouse.findUnique({
      where: { id },
      select: { gender: true },
    });
    if (existing && existing.gender !== gender && gender !== "MIXED") {
      const wrong = await db.boardingAllocation.count({
        where: {
          endedOn: null,
          room: { houseId: id },
          student: { gender: gender === "BOYS" ? "FEMALE" : "MALE" },
        },
      });
      if (wrong) {
        return {
          error: `${wrong} boarder${wrong === 1 ? "" : "s"} already in this house would not be allowed under that change. Move them first.`,
        };
      }
    }
  }

  const data = {
    name,
    gender: gender as "BOYS" | "GIRLS" | "MIXED",
    code: text(formData, "code") || null,
    houseParentId: text(formData, "houseParentId") || null,
    assistantId: text(formData, "assistantId") || null,
    colour: text(formData, "colour") || null,
    motto: text(formData, "motto") || null,
    notes: text(formData, "notes") || null,
    active: formData.get("active") !== null,
  };

  const saved = id
    ? await db.boardingHouse.update({ where: { id }, data, select: { id: true } })
    : await db.boardingHouse.create({ data, select: { id: true } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "boarding.house.update" : "boarding.house.create",
      entity: "BoardingHouse",
      entityId: saved.id,
      summary: `${id ? "Edited" : "Added"} boarding house: ${name}`,
    },
  });

  revalidatePath("/boarding");
  revalidatePath("/boarding/houses");
  return { ok: true, id: saved.id, message: id ? "Saved." : "House added." };
}

/** Saves a room, and the beds in it. */
export async function saveRoomAction(
  _previous: BoardingState,
  formData: FormData,
): Promise<BoardingState> {
  let user;
  try {
    user = await authorize("boarding.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id") || null;
  const houseId = text(formData, "houseId");
  const name = text(formData, "name");
  if (!houseId) return { error: "Which house?" };
  if (!name) return { error: "Give the room a name." };

  const capacity = number(formData, "capacity", 0);
  if (capacity <= 0) return { error: "How many beds does it have?" };

  const clash = await db.boardingRoom.findFirst({
    where: { houseId, name, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (clash) return { error: `That house already has a ${name}.` };

  // Shrinking a room below the number of children already in it would put the
  // over-capacity warning on a room nobody had touched, and the school would
  // find out from a red badge rather than from the person doing it.
  if (id) {
    const year = await currentYearId();
    const occupied = year
      ? await db.boardingAllocation.count({
          where: { roomId: id, endedOn: null, academicYearId: year },
        })
      : 0;
    if (capacity < occupied) {
      return {
        error: `${occupied} boarder${occupied === 1 ? " is" : "s are"} in this room, so it cannot be set to ${capacity} bed${capacity === 1 ? "" : "s"}. Move them first.`,
      };
    }
  }

  const data = {
    houseId,
    name,
    capacity,
    floor: text(formData, "floor") || null,
    notes: text(formData, "notes") || null,
    active: formData.get("active") !== null,
  };

  const saved = id
    ? await db.boardingRoom.update({ where: { id }, data, select: { id: true } })
    : await db.boardingRoom.create({ data, select: { id: true } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: id ? "boarding.room.update" : "boarding.room.create",
      entity: "BoardingRoom",
      entityId: saved.id,
      summary: `${id ? "Edited" : "Added"} room ${name} (${capacity} bed${capacity === 1 ? "" : "s"})`,
    },
  });

  revalidatePath("/boarding");
  revalidatePath("/boarding/houses");
  return { ok: true, id: saved.id, message: id ? "Saved." : "Room added." };
}

/**
 * Puts a boarder in a bed.
 *
 * Any bed they already hold this year is closed in the same transaction rather
 * than deleted, so a move keeps the record of where they slept before it. The
 * capacity is counted again inside that transaction because the check that
 * offered the room is racy — two clerks can both read seven beds of eight, and
 * the loser of that race should be told, not accommodated.
 */
export async function allocateBedAction(formData: FormData): Promise<BoardingState> {
  let user;
  try {
    user = await authorize("boarding.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = text(formData, "studentId");
  const roomId = text(formData, "roomId");
  if (!studentId || !roomId) return { error: "Which pupil, and which room?" };

  const academicYearId = await currentYearId();
  if (!academicYearId) return { error: "Set a current academic year first." };

  const refusal = await allocationRefusal({ studentId, roomId, academicYearId });
  if (refusal) return { error: refusal };

  const room = await db.boardingRoom.findUnique({
    where: { id: roomId },
    select: { name: true, capacity: true, house: { select: { name: true } } },
  });
  if (!room) return { error: "That room was not found." };

  try {
    await db.$transaction(async (tx) => {
      const taken = await tx.boardingAllocation.count({
        where: { roomId, endedOn: null, academicYearId },
      });
      if (taken >= room.capacity) {
        throw new Error(
          `${room.name} filled up while you were looking at it — ${taken} of ${room.capacity} beds are taken.`,
        );
      }

      await tx.boardingAllocation.updateMany({
        where: { studentId, academicYearId, endedOn: null },
        data: { endedOn: new Date() },
      });

      await tx.boardingAllocation.create({
        data: {
          studentId,
          roomId,
          academicYearId,
          bedLabel: text(formData, "bedLabel") || null,
          notes: text(formData, "notes") || null,
        },
      });

      // The free-text fields on Student predate this and are still read by the
      // older boarding page and by report headers. Kept in step here so the
      // two do not tell a parent different rooms.
      await tx.student.update({
        where: { id: studentId },
        data: {
          isBoarder: true,
          house: room.house.name,
          dormitory: room.name,
          roomNumber: text(formData, "bedLabel") || null,
        },
      });
    });
  } catch (error) {
    return { error: (error as Error).message };
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "boarding.allocate",
      entity: "Student",
      entityId: studentId,
      summary: `Allocated to ${room.house.name} · ${room.name}`,
    },
  });

  revalidatePath("/boarding");
  revalidatePath(`/students/${studentId}`);
  return { ok: true, message: `Allocated to ${room.house.name}, ${room.name}.` };
}

/** Takes a boarder out of their bed without putting them in another. */
export async function endAllocationAction(formData: FormData): Promise<BoardingState> {
  let user;
  try {
    user = await authorize("boarding.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = text(formData, "studentId");
  if (!studentId) return { error: "Which pupil?" };

  const academicYearId = await currentYearId();
  if (!academicYearId) return { error: "Set a current academic year first." };

  const closed = await db.boardingAllocation.updateMany({
    where: { studentId, academicYearId, endedOn: null },
    data: { endedOn: new Date() },
  });
  if (closed.count === 0) return { error: "They are not in a bed." };

  // The free-text fields go with it, or the old page keeps showing a room the
  // child no longer has.
  await db.student.update({
    where: { id: studentId },
    data: { house: null, dormitory: null, roomNumber: null },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "boarding.deallocate",
      entity: "Student",
      entityId: studentId,
      summary: "Taken out of boarding accommodation",
    },
  });

  revalidatePath("/boarding");
  revalidatePath(`/students/${studentId}`);
  return { ok: true, message: "Bed released." };
}

/**
 * Raises a leave-out.
 *
 * The person collecting is written down as a name, not chosen from the
 * guardian list: at a Ghanaian school gate it is as often an uncle, a driver
 * or an elder sibling, and the name on the form is what the gate checks
 * against whoever it belongs to.
 */
export async function requestExeatAction(
  _previous: BoardingState,
  formData: FormData,
): Promise<BoardingState> {
  let user;
  try {
    user = await authorize("boarding.exeat.request");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = text(formData, "studentId");
  if (!studentId) return { error: "Which boarder?" };

  const reason = text(formData, "reason");
  const destination = text(formData, "destination");
  const releasedToName = text(formData, "releasedToName");
  if (!reason) return { error: "Why are they going?" };
  if (!destination) return { error: "Where are they going?" };
  if (!releasedToName) return { error: "Who is collecting them?" };

  const departsAt = new Date(text(formData, "departsAt"));
  const dueBackAt = new Date(text(formData, "dueBackAt"));
  if (Number.isNaN(departsAt.getTime())) return { error: "When do they leave?" };
  if (Number.isNaN(dueBackAt.getTime())) return { error: "When are they due back?" };
  if (dueBackAt <= departsAt) {
    return { error: "They cannot be due back before they have left." };
  }

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { status: true, firstName: true, lastName: true },
  });
  if (!student) return { error: "That pupil was not found." };
  if (student.status !== "ENROLLED") {
    return { error: `${student.firstName} ${student.lastName} is not currently enrolled.` };
  }

  // Already off the premises. The database forbids two at once as well, but a
  // sentence beats a constraint violation.
  const out = await db.boardingExeat.findFirst({
    where: { studentId, status: "OUT" },
    select: { id: true, dueBackAt: true },
  });
  if (out) {
    return {
      error: `${student.firstName} is already signed out and not yet back. Sign them in first.`,
    };
  }

  const academicYearId = await currentYearId();
  const bed = academicYearId
    ? await db.boardingAllocation.findFirst({
        where: { studentId, academicYearId, endedOn: null },
        select: { room: { select: { houseId: true } } },
      })
    : null;

  const created = await db.boardingExeat.create({
    data: {
      studentId,
      houseId: bed?.room.houseId ?? null,
      reason,
      destination,
      departsAt,
      dueBackAt,
      releasedToName,
      releasedToPhone: text(formData, "releasedToPhone") || null,
      relationship: text(formData, "relationship") || null,
      notes: text(formData, "notes") || null,
      // Somebody who can approve, raising it themselves, has approved it. The
      // alternative is a house parent filling in a form and then pressing
      // approve on their own form, which is theatre rather than a control.
      ...(userCan(user, "boarding.exeat.approve")
        ? {
            status: "APPROVED" as const,
            approvedById: user.staffId ?? null,
            approvedAt: new Date(),
          }
        : {}),
    },
    select: { id: true, status: true },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "boarding.exeat.request",
      entity: "BoardingExeat",
      entityId: created.id,
      summary: `Leave-out for ${student.firstName} ${student.lastName} to ${destination}`,
    },
  });

  revalidatePath("/boarding/exeat");
  revalidatePath("/boarding");
  return {
    ok: true,
    id: created.id,
    message:
      created.status === "APPROVED"
        ? "Recorded and approved. The gate can sign them out."
        : "Recorded. It needs approving before the gate will release them.",
  };
}

/**
 * Approve, turn down, sign out, sign in.
 *
 * One action, because they are one sequence and share one table of what may
 * follow what. Which permission each step needs differs: approving is a
 * housemaster's decision, and the two at the gate belong to whoever is
 * standing at it.
 */
export async function decideExeatAction(formData: FormData): Promise<BoardingState> {
  const id = text(formData, "id");
  const to = text(formData, "status");
  if (!id) return { error: "Which leave-out?" };

  try {
    await authorize("boarding.read");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const exeat = await db.boardingExeat.findUnique({
    where: { id },
    select: {
      status: true,
      dueBackAt: true,
      releasedToName: true,
      student: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!exeat) return { error: "That leave-out was not found." };

  if (!canBecome(exeat.status, to)) {
    return {
      error: `A leave-out that is ${exeat.status.toLowerCase()} cannot become ${to.toLowerCase()}.`,
    };
  }

  const needed =
    to === "OUT" || to === "RETURNED" ? "boarding.gate" : "boarding.exeat.approve";

  let user;
  try {
    user = await authorize(needed);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: to };

  if (to === "APPROVED") {
    data.approvedById = user.staffId ?? null;
    data.approvedAt = now;
    data.decisionNote = text(formData, "note") || null;
  }
  if (to === "CANCELLED") {
    data.decisionNote = text(formData, "note") || null;
  }
  if (to === "OUT") {
    data.signedOutAt = now;
    data.signedOutById = user.staffId ?? null;
  }
  if (to === "RETURNED") {
    data.signedInAt = now;
    data.signedInById = user.staffId ?? null;
  }

  await db.boardingExeat.update({ where: { id }, data });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: `boarding.exeat.${to.toLowerCase()}`,
      entity: "BoardingExeat",
      entityId: id,
      summary:
        to === "OUT"
          ? `${exeat.student.firstName} ${exeat.student.lastName} released to ${exeat.releasedToName}`
          : to === "RETURNED"
            ? `${exeat.student.firstName} ${exeat.student.lastName} signed back in`
            : `${exeat.student.firstName} ${exeat.student.lastName}: ${to.toLowerCase()}`,
    },
  });

  revalidatePath("/boarding/exeat");
  revalidatePath("/boarding");
  revalidatePath(`/students/${exeat.student.id}`);

  return {
    ok: true,
    message:
      to === "OUT"
        ? `Signed out to ${exeat.releasedToName}.`
        : to === "RETURNED"
          ? "Signed back in."
          : "Done.",
  };
}
