"use server";

import { revalidatePath } from "next/cache";
import type { AttendanceStatus } from "@prisma/client";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/messaging";
import { toDateOnly } from "@/lib/utils";

export type SaveAttendanceInput = {
  classSectionId: string;
  termId: string;
  date: string;
  entries: Array<{
    studentId: string;
    status: AttendanceStatus;
    minutesLate?: number | null;
    reason?: string | null;
  }>;
};

export type SaveAttendanceResult =
  | { ok: true; recorded: number; notified: number }
  | { ok: false; error: string };

/**
 * Saves a class register.
 *
 * Idempotent: re-submitting the same date replaces the existing marks rather
 * than creating duplicates, which is what happens in practice when a teacher
 * corrects a register later in the day.
 */
export async function saveAttendance(
  input: SaveAttendanceInput,
): Promise<SaveAttendanceResult> {
  const user = await authorize(["attendance.take", "attendance.update"]);

  if (!input.entries.length) {
    return { ok: false, error: "No students to record." };
  }

  const date = toDateOnly(input.date);
  if (date.getTime() > Date.now() + 86_400_000) {
    return { ok: false, error: "Attendance cannot be taken for a future date." };
  }

  try {
    // Found-then-written rather than upserted on the compound key, because a
    // daily register has no periodIndex and Postgres treats NULL as distinct
    // from NULL inside a unique index. So `periodIndex: null` in the upsert's
    // where-clause matched nothing, ever: the constraint permitted a second row
    // and the upsert created one. A teacher correcting a register at lunchtime
    // did not replace the morning's — they made a second session for the same
    // class on the same day, and the student was then both present and absent.
    // Every attendance percentage on top of that was computed over both.
    const existing = await db.attendanceSession.findFirst({
      where: {
        classSectionId: input.classSectionId,
        date,
        type: "DAILY",
        periodIndex: null,
      },
      select: { id: true },
    });

    const session = existing
      ? await db.attendanceSession.update({
          where: { id: existing.id },
          data: { takenById: user.staffId, takenAt: new Date() },
        })
      : await db.attendanceSession.create({
          data: {
            classSectionId: input.classSectionId,
            termId: input.termId,
            date,
            type: "DAILY",
            takenById: user.staffId,
            takenAt: new Date(),
          },
        });

    // Replace the whole register in one transaction so a partial save can
    // never leave half a class marked.
    await db.$transaction([
      db.attendanceRecord.deleteMany({ where: { sessionId: session.id } }),
      db.attendanceRecord.createMany({
        data: input.entries.map((entry) => ({
          sessionId: session.id,
          studentId: entry.studentId,
          status: entry.status,
          minutesLate: entry.status === "LATE" ? (entry.minutesLate ?? null) : null,
          reason: entry.reason ?? null,
        })),
      }),
    ]);

    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: "attendance.take",
        entity: "AttendanceSession",
        entityId: session.id,
        summary: `Recorded attendance for ${input.entries.length} students`,
      },
    });

    // Tell guardians about an unexplained absence the same day.
    const absentIds = input.entries
      .filter((entry) => entry.status === "ABSENT")
      .map((entry) => entry.studentId);

    let notified = 0;
    if (absentIds.length) {
      notified = await notifyGuardiansOfAbsence(absentIds);
    }

    revalidatePath("/attendance");
    return { ok: true, recorded: input.entries.length, notified };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

async function notifyGuardiansOfAbsence(studentIds: string[]): Promise<number> {
  const students = await db.student.findMany({
    where: { id: { in: studentIds } },
    select: {
      firstName: true,
      lastName: true,
      guardians: {
        where: { isPrimary: true },
        select: { guardian: { select: { user: { select: { id: true } } } } },
      },
    },
  });

  let count = 0;
  for (const student of students) {
    const userIds = student.guardians
      .map((link) => link.guardian.user?.id)
      .filter((id): id is string => Boolean(id));
    if (!userIds.length) continue;

    await notifyUsers(userIds, {
      title: "Absence recorded",
      body: `${student.firstName} ${student.lastName} was marked absent today. Please contact the school office if this is unexpected.`,
      category: "ATTENDANCE",
      url: "/portal/guardian/attendance",
    }).catch(() => undefined);

    count += userIds.length;
  }

  return count;
}
