"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  DEFAULT_EXPECTED_ARRIVAL,
  DEFAULT_GRACE_MINUTES,
  MARKABLE,
  absencesFromLeave,
  absentOn,
  dayKey,
  latenessAgainst,
  markRefusal,
  parseClock,
  parseDay,
  today,
  type Markable,
} from "@/lib/staff-attendance-rules";

export type RegisterState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

const STATUSES = new Set<string>(MARKABLE.map((entry) => entry.value));

/**
 * Who is on approved leave that day.
 *
 * Read here as well as on the page, and read the same way, because the page
 * decides who may be marked and this decides whether to write it. If the two
 * disagreed, the register would offer a row it then refuses, which is the
 * shape of every bug this module was written to remove.
 */
async function leaveOn(date: Date) {
  const rows = await db.staffLeave.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: new Date(date.getTime() + 86_400_000) },
      endDate: { gte: new Date(date.getTime() - 86_400_000) },
    },
    select: { staffId: true, startDate: true, endDate: true, leaveType: true },
  });
  return absentOn(absencesFromLeave(rows), date);
}

/**
 * Mark one person on one day.
 *
 * An upsert on (staffId, date), which is the unique index. Correcting a
 * register is the ordinary case, not the exception: the head marks everybody
 * present at assembly and the three who were not turn up over the next hour.
 */
export async function markStaffAction(
  _state: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const user = await authorize("staff.attendance.record");

  const staffId = text(formData, "staffId");
  const date = parseDay(text(formData, "date"));
  const status = text(formData, "status");

  if (!staffId) return { error: "No member of staff was named." };
  if (!date) return { error: "That is not a date." };
  if (!STATUSES.has(status)) return { error: "That is not a status the register holds." };

  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { id: true, status: true, firstName: true, lastName: true },
  });
  if (!staff) return { error: "That member of staff no longer exists." };

  const arrivedMinutes = parseClock(text(formData, "arrived"));
  const leftMinutes = parseClock(text(formData, "left"));
  const reason = text(formData, "reason") || null;

  const onLeave = (await leaveOn(date)).get(staffId) ?? null;

  const refusal = markRefusal({
    date,
    now: today(),
    onLeave,
    staffActive: staff.status === "ACTIVE",
    request: { status: status as Markable, arrivedMinutes, leftMinutes },
  });
  if (refusal) return { error: refusal };

  // Lateness is derived, never typed. Somebody entering both an arrival time
  // and a number of minutes late is entering the same fact twice, and the two
  // disagree the moment the school moves its start time.
  const minutesLate =
    status === "ABSENT"
      ? null
      : latenessAgainst(arrivedMinutes, DEFAULT_EXPECTED_ARRIVAL + DEFAULT_GRACE_MINUTES);

  const shared = {
    status: status as Markable,
    arrivedMinutes: status === "ABSENT" ? null : arrivedMinutes,
    leftMinutes: status === "ABSENT" ? null : leftMinutes,
    minutesLate,
    reason,
    recordedById: user.staffId ?? null,
  };

  await db.staffAttendance.upsert({
    where: { staffId_date: { staffId, date } },
    update: shared,
    create: { staffId, date, ...shared },
  });

  revalidatePath("/staff/attendance");
  return {
    ok: true,
    message: `${staff.firstName} ${staff.lastName} marked.`,
  };
}

/**
 * Mark everybody who has not been marked yet as present.
 *
 * The register as a school actually takes it: the exceptions are what somebody
 * writes down, and everyone else was there. Deliberately only fills the gaps,
 * so pressing it twice cannot overwrite the three absences already recorded.
 */
export async function markRemainingPresentAction(
  _state: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const user = await authorize("staff.attendance.record");

  const date = parseDay(text(formData, "date"));
  if (!date) return { error: "That is not a date." };

  if (date.getTime() > today().getTime()) {
    return {
      error:
        "That day has not happened yet. A register marked in advance records absences for people who then turn up.",
    };
  }

  const [staff, marked, onLeave] = await Promise.all([
    db.staff.findMany({ where: { status: "ACTIVE" }, select: { id: true } }),
    db.staffAttendance.findMany({ where: { date }, select: { staffId: true } }),
    leaveOn(date),
  ]);

  const already = new Set(marked.map((row) => row.staffId));
  const toMark = staff.filter((member) => !already.has(member.id) && !onLeave.has(member.id));

  if (toMark.length === 0) {
    return { ok: true, message: "Everybody was already accounted for." };
  }

  await db.staffAttendance.createMany({
    data: toMark.map((member) => ({
      staffId: member.id,
      date,
      status: "PRESENT" as const,
      recordedById: user.staffId ?? null,
    })),
    skipDuplicates: true,
  });

  revalidatePath("/staff/attendance");
  return {
    ok: true,
    message: `${toMark.length} marked present for ${dayKey(date)}.`,
  };
}

/** Undo a mark, so a row entered against the wrong person can be removed. */
export async function clearStaffMarkAction(
  _state: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  await authorize("staff.attendance.record");

  const staffId = text(formData, "staffId");
  const date = parseDay(text(formData, "date"));
  if (!staffId || !date) return { error: "Nothing to clear." };

  await db.staffAttendance.deleteMany({ where: { staffId, date } });

  revalidatePath("/staff/attendance");
  return { ok: true, message: "Mark cleared." };
}
