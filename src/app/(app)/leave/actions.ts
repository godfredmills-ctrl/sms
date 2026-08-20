"use server";

import { revalidatePath } from "next/cache";

import { authorize, requireUser, userCan } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/messaging";

export type LeaveState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Working days between two dates, inclusive — weekends do not count. */
function workingDays(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * A staff member asks for leave.
 *
 * No permission gates this — being staff is the qualification. What is
 * checked is that the request belongs to the person making it: the staffId
 * comes from the session, never the form, because a leave request filed in
 * someone else's name is a shortcut to two kinds of trouble.
 */
export async function requestLeaveAction(
  _previous: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  const user = await requireUser();
  if (!user.staffId) {
    return { error: "Only staff with a linked staff record can request leave." };
  }

  const leaveType = text(formData, "leaveType");
  const startRaw = text(formData, "startDate");
  const endRaw = text(formData, "endDate");
  if (!leaveType || !startRaw) return { error: "Choose the type and the first day." };

  // Date-only strings parse as UTC midnight, but the weekday check below
  // runs in server-local time — on a server west of Greenwich every date
  // would shift a day. Anchoring to local noon-less midnight keeps them in
  // the same calendar everywhere.
  const startDate = new Date(startRaw + "T00:00:00");
  const endDate = endRaw ? new Date(endRaw + "T00:00:00") : new Date(startRaw + "T00:00:00");
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { error: "Those dates are not valid." };
  }
  if (endDate < startDate) return { error: "Leave cannot end before it starts." };

  const days = workingDays(startDate, endDate);
  if (days === 0) return { error: "That period contains no working days." };
  if (days > 190) return { error: "That is more than a school year. Check the dates." };

  // One live request per overlapping period — a duplicate is nearly always a
  // double-click, and where it is not, the first should be decided first.
  const overlapping = await db.staffLeave.findFirst({
    where: {
      staffId: user.staffId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true, status: true },
  });
  if (overlapping) {
    return {
      error:
        overlapping.status === "PENDING"
          ? "You already have a pending request covering those dates."
          : "You already have approved leave covering those dates.",
    };
  }

  await db.staffLeave.create({
    data: {
      staffId: user.staffId,
      leaveType,
      startDate,
      endDate,
      days,
      reason: text(formData, "reason") || null,
    },
  });

  // Tell the people who can decide, so a request is never waiting on someone
  // remembering to open the page.
  const approvers = await db.user.findMany({
    where: {
      status: "ACTIVE",
      id: { not: user.id },
      roles: {
        some: {
          role: {
            permissions: { some: { permission: { key: "staff.leave.manage" } } },
          },
        },
      },
    },
    select: { id: true },
    take: 10,
  });

  if (approvers.length) {
    await notifyUsers(
      approvers.map((approver) => approver.id),
      {
        title: "Leave request",
        body: `${user.fullName} has requested ${days} day${days === 1 ? "" : "s"} of ${leaveType.toLowerCase()} leave.`,
        category: "GENERAL",
        url: "/leave",
      },
    ).catch(() => undefined);
  }

  revalidatePath("/leave");
  return {
    ok: true,
    message: `Requested — ${days} working day${days === 1 ? "" : "s"}. You will be notified when it is decided.`,
  };
}

/** The requester can withdraw a request that has not been decided. */
export async function cancelLeaveAction(formData: FormData) {
  const user = await requireUser();
  if (!user.staffId) return;

  const id = text(formData, "id");
  if (!id) return;

  // The where clause is the authorisation: own request, still pending.
  await db.staffLeave.updateMany({
    where: { id, staffId: user.staffId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/leave");
}

/**
 * Approves or rejects a request.
 *
 * Deciding your own leave is refused even for the head teacher — an approval
 * chain where someone can sign their own slip is not an approval chain, and
 * the second super_admin can decide theirs.
 */
export async function decideLeaveAction(
  _previous: LeaveState,
  formData: FormData,
): Promise<LeaveState> {
  let user;
  try {
    user = await authorize("staff.leave.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const decision = text(formData, "decision");
  if (!id || !["APPROVED", "REJECTED"].includes(decision)) {
    return { error: "Choose approve or reject." };
  }

  const request = await db.staffLeave.findUnique({
    where: { id },
    select: {
      status: true,
      days: true,
      leaveType: true,
      staff: {
        select: { id: true, firstName: true, lastName: true, userId: true },
      },
    },
  });
  if (!request) return { error: "Request not found." };
  if (request.status !== "PENDING") {
    return { error: "This request has already been decided." };
  }
  if (user.staffId && request.staff.id === user.staffId) {
    return { error: "Your own leave needs someone else's signature." };
  }

  await db.staffLeave.update({
    where: { id },
    data: {
      status: decision,
      approvedBy: user.fullName,
      approvedAt: new Date(),
      comments: text(formData, "comments") || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "staff.leave.decide",
      entity: "StaffLeave",
      entityId: id,
      summary: `${decision === "APPROVED" ? "Approved" : "Rejected"} ${request.days} day(s) ${request.leaveType.toLowerCase()} leave for ${request.staff.firstName} ${request.staff.lastName}`,
    },
  });

  if (request.staff.userId) {
    await notifyUsers([request.staff.userId], {
      title: `Leave ${decision === "APPROVED" ? "approved" : "not approved"}`,
      body:
        decision === "APPROVED"
          ? `Your ${request.leaveType.toLowerCase()} leave (${request.days} day${request.days === 1 ? "" : "s"}) has been approved.`
          : `Your ${request.leaveType.toLowerCase()} leave request was not approved.${text(formData, "comments") ? ` Note: ${text(formData, "comments")}` : ""}`,
      category: "GENERAL",
      url: "/leave",
    }).catch(() => undefined);
  }

  revalidatePath("/leave");
  return { ok: true, message: `${decision === "APPROVED" ? "Approved" : "Rejected"}.` };
}

