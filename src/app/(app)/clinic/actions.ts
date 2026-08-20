"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/messaging";

export type ClinicState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Logs a clinic visit against the student's medical record.
 *
 * The medical record was created at admission precisely so this moment — a
 * child in the clinic, a nurse with one hand free — never involves creating
 * anything but the visit itself. If an older record predates that rule, one
 * is created here rather than refusing the entry.
 *
 * Notifying the guardian is a checkbox, not automatic: a plaster does not
 * need a phone call, and the nurse in the room is the right person to judge.
 * When ticked, every guardian flagged as an emergency contact is notified.
 */
export async function logClinicVisitAction(
  _previous: ClinicState,
  formData: FormData,
): Promise<ClinicState> {
  let user;
  try {
    user = await authorize("student.medical.update");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = text(formData, "studentId");
  const complaint = text(formData, "complaint");
  if (!studentId) return { error: "Choose the student." };
  if (!complaint) return { error: "What brought them in?" };

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      firstName: true,
      lastName: true,
      medical: { select: { id: true } },
    },
  });
  if (!student) return { error: "Student not found." };

  const medicalId =
    student.medical?.id ??
    (
      await db.studentMedical.create({
        data: { studentId },
        select: { id: true },
      })
    ).id;

  const temperatureRaw = text(formData, "temperature");
  const temperature = temperatureRaw ? Number(temperatureRaw) : null;
  if (temperature !== null && (!Number.isFinite(temperature) || temperature < 30 || temperature > 45)) {
    return { error: "That temperature is not one a person has. Check the reading." };
  }

  const notifyGuardian = formData.get("notifyGuardian") === "on";

  // Whether a message was actually sent, not whether the nurse asked for one.
  // The record used to store the tick: a child whose guardians have no portal
  // account — the common case for a family that fills in paper forms — was
  // filed as "Family notified" with nothing sent, and the visit history said
  // so months later when it mattered.
  let notified = false;

  if (notifyGuardian) {
    const guardians = await db.studentGuardian.findMany({
      where: { studentId, isEmergency: true },
      select: { guardian: { select: { user: { select: { id: true } } } } },
    });
    const userIds = guardians
      .map((link) => link.guardian.user?.id)
      .filter((id): id is string => Boolean(id));

    if (userIds.length) {
      await notifyUsers(userIds, {
        title: `${student.firstName} visited the clinic`,
        body: `${student.firstName} ${student.lastName} was seen for: ${complaint}. ${
          text(formData, "outcome") === "SENT_HOME"
            ? "They are being sent home — please arrange collection."
            : "They have been attended to."
        }`,
        category: "GENERAL",
        priority: text(formData, "outcome") === "SENT_HOME" ? "URGENT" : "HIGH",
        url: "/portal/guardian",
      })
        .then(() => {
          notified = true;
        })
        .catch(() => undefined);
    }
  }

  await db.clinicVisit.create({
    data: {
      medicalId,
      complaint,
      temperature,
      treatment: text(formData, "treatment") || null,
      medicationGiven: text(formData, "medicationGiven") || null,
      outcome: text(formData, "outcome") || "RETURNED_TO_CLASS",
      attendedBy: user.fullName,
      guardianNotified: notified,
      notes: text(formData, "notes") || null,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "student.medical.visit",
      entity: "Student",
      entityId: studentId,
      summary: `Clinic visit: ${student.firstName} ${student.lastName} — ${complaint.slice(0, 60)}`,
    },
  });

  revalidatePath("/clinic");
  revalidatePath(`/students/${studentId}`);
  // The nurse is standing next to the child; if nobody was reached, that is
  // the one thing they need to know now rather than from the record later.
  return {
    ok: true,
    message: !notifyGuardian
      ? "Logged."
      : notified
        ? "Logged, and the emergency contacts have been notified."
        : "Logged — but no emergency contact could be reached from here. None of them has a portal account, so phone them.",
  };
}
