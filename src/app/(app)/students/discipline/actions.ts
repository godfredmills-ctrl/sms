"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/messaging";
import { humanise } from "@/lib/utils";

import { CATEGORY_VALUES, SANCTION_VALUES, SEVERITY_VALUES } from "./fields";

export type DisciplineState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Records a disciplinary incident on a student's file.
 *
 * The DisciplinaryRecord table and the conduct tab that reads it have existed
 * since the schema was first written — but nothing ever wrote to them, so the
 * form teacher who caught the fight at break had a permission
 * (student.discipline.manage) and nowhere to use it. This is the write path.
 *
 * The vocabulary is validated against fields.ts rather than trusted from the
 * form, and telling the family is a checkbox: a uniform reminder does not
 * need a phone buzzing at work, and the teacher in the room is the right
 * person to judge. When ticked, every guardian with a portal account hears —
 * discipline is family-wide news, not just the emergency contact's.
 */
export async function recordIncidentAction(
  _previous: DisciplineState,
  formData: FormData,
): Promise<DisciplineState> {
  let user;
  try {
    user = await authorize("student.discipline.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const studentId = text(formData, "studentId");
  const description = text(formData, "description");
  const category = text(formData, "category");
  const severity = text(formData, "severity") || "MINOR";
  const sanction = text(formData, "sanction");

  if (!studentId) return { error: "Choose the student." };
  if (!description) return { error: "Describe what happened." };
  if (!CATEGORY_VALUES.includes(category as never)) {
    return { error: "Choose the category of incident." };
  }
  if (!SEVERITY_VALUES.includes(severity as never)) {
    return { error: "That severity is not one of the options." };
  }
  if (sanction && !SANCTION_VALUES.includes(sanction as never)) {
    return { error: "That sanction is not one of the options." };
  }

  // Suspension days only mean something with a suspension.
  const suspensionRaw = text(formData, "suspensionDays");
  let suspensionDays: number | null = null;
  if (sanction === "SUSPENSION") {
    suspensionDays = suspensionRaw ? Number(suspensionRaw) : null;
    if (
      suspensionDays !== null &&
      (!Number.isInteger(suspensionDays) || suspensionDays < 1 || suspensionDays > 30)
    ) {
      return { error: "Suspension is measured in whole days, one to thirty." };
    }
  }

  // Date-only input, parsed local (same rule as leave), defaulting to today.
  // The future is refused: an incident is recorded after it happens.
  const whenRaw = text(formData, "incidentAt");
  const incidentAt = whenRaw ? new Date(whenRaw + "T12:00:00") : new Date();
  if (Number.isNaN(incidentAt.getTime())) return { error: "That date is not valid." };
  if (incidentAt.getTime() > Date.now() + 12 * 60 * 60 * 1000) {
    return { error: "That date is in the future." };
  }

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { firstName: true, lastName: true },
  });
  if (!student) return { error: "Student not found." };

  const notifyGuardian = formData.get("notifyGuardian") === "on";

  const record = await db.disciplinaryRecord.create({
    data: {
      studentId,
      incidentAt,
      category,
      severity,
      description,
      location: text(formData, "location") || null,
      witnesses: text(formData, "witnesses") || null,
      actionTaken: text(formData, "actionTaken") || null,
      sanction: sanction || null,
      suspensionDays,
      reportedBy: user.fullName,
      guardianNotified: notifyGuardian,
      guardianNotifiedAt: notifyGuardian ? new Date() : null,
    },
    select: { id: true },
  });

  if (notifyGuardian) {
    const guardians = await db.studentGuardian.findMany({
      where: { studentId },
      select: { guardian: { select: { user: { select: { id: true } } } } },
    });
    const userIds = guardians
      .map((link) => link.guardian.user?.id)
      .filter((id): id is string => Boolean(id));

    if (userIds.length) {
      // Category and consequence, not the narrative: this lands on lock
      // screens, and the full account is a conversation with the school.
      await notifyUsers(userIds, {
        title: `Conduct: ${student.firstName}`,
        body: `A ${humanise(severity).toLowerCase()} conduct incident (${humanise(category).toLowerCase()}) involving ${student.firstName} ${student.lastName} has been recorded.${
          sanction
            ? ` Sanction: ${humanise(sanction).toLowerCase()}${suspensionDays ? ` (${suspensionDays} day${suspensionDays === 1 ? "" : "s"})` : ""}.`
            : ""
        } Please contact the school office to discuss.`,
        category: "GENERAL",
        priority:
          severity === "SEVERE" || sanction === "SUSPENSION" || sanction === "EXPULSION"
            ? "URGENT"
            : "HIGH",
        url: "/portal/guardian",
      }).catch(() => undefined);
    }
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "student.discipline.record",
      entity: "DisciplinaryRecord",
      entityId: record.id,
      summary: `${humanise(category)} (${humanise(severity).toLowerCase()}): ${student.firstName} ${student.lastName} — ${description.slice(0, 60)}`,
    },
  });

  revalidatePath("/students/discipline");
  revalidatePath(`/students/${studentId}`);
  return {
    ok: true,
    message: notifyGuardian
      ? "Recorded, and the family has been notified."
      : "Recorded.",
  };
}

/**
 * Closes an open case with a resolution note, stamped with who closed it.
 * Plain-form action: called from the case list, no client state needed.
 */
export async function resolveIncidentAction(formData: FormData) {
  const user = await authorize("student.discipline.manage");

  const id = text(formData, "id");
  if (!id) return;

  const record = await db.disciplinaryRecord.findUnique({
    where: { id },
    select: {
      status: true,
      category: true,
      studentId: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });
  if (!record || record.status === "RESOLVED") return;

  await db.disciplinaryRecord.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolution: text(formData, "resolution") || "Resolved.",
      handledBy: user.fullName,
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "student.discipline.resolve",
      entity: "DisciplinaryRecord",
      entityId: id,
      summary: `Resolved ${humanise(record.category).toLowerCase()} case: ${record.student.firstName} ${record.student.lastName}`,
    },
  });

  revalidatePath("/students/discipline");
  revalidatePath(`/students/${record.studentId}`);
}
