"use server";

import { revalidatePath } from "next/cache";

import { authorize, userCan } from "@/lib/auth";
import { generateCode, hashPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { DEACTIVATION_REASONS, describeDeactivation } from "@/lib/guardian-contact";
import { parseAttachedDocuments } from "@/lib/person-documents";
import { normalisePhone } from "@/lib/utils";

export type GuardianState = {
  ok?: boolean;
  error?: string;
  message?: string;
  guardianId?: string;
  temporaryPassword?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

/** Fields shared by create and edit, so the two cannot drift. */
function guardianFieldsFrom(formData: FormData) {
  return {
    title: optional(formData, "title"),
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    otherNames: optional(formData, "otherNames"),
    gender: (text(formData, "gender") || "UNDISCLOSED") as never,

    email: optional(formData, "email"),
    phone: normalisePhone(text(formData, "phone")) ?? "",
    altPhone: normalisePhone(text(formData, "altPhone")),
    whatsapp: normalisePhone(text(formData, "whatsapp")),
    address: optional(formData, "address"),
    digitalAddr: optional(formData, "digitalAddr"),
    city: optional(formData, "city"),

    nationality: text(formData, "nationality") || "Ghanaian",
    nationalId: optional(formData, "nationalId"),
    occupation: optional(formData, "occupation"),
    employer: optional(formData, "employer"),
    jobTitle: optional(formData, "jobTitle"),
    workPhone: normalisePhone(text(formData, "workPhone")),
    religion: optional(formData, "religion"),

    preferredChannel: (text(formData, "preferredChannel") || "SMS") as never,
    notes: optional(formData, "notes"),
  };
}

export async function createGuardianAction(
  _previous: GuardianState,
  formData: FormData,
): Promise<GuardianState> {
  let user;
  try {
    user = await authorize("student.guardian.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const fields = guardianFieldsFrom(formData);
  if (!fields.firstName || !fields.lastName) {
    return { error: "First and last name are required." };
  }
  if (!fields.phone) {
    return { error: "A guardian needs a phone number the school can reach." };
  }

  // The phone number is the identity the rest of the system already keys on:
  // the importer reuses guardians by phone, and the admission form does the
  // same. Creating a second record for a number that exists would split one
  // parent's fee history and reminders in two, so it is refused with a
  // pointer instead.
  const existing = await db.guardian.findFirst({
    where: { phone: fields.phone },
    select: { id: true, firstName: true, lastName: true },
  });
  if (existing) {
    return {
      error: `${existing.firstName} ${existing.lastName} already has this phone number. Open their record and link the ward there, rather than creating a duplicate.`,
      guardianId: existing.id,
    };
  }

  const guardian = await db.guardian.create({ data: fields });

  const attached = parseAttachedDocuments(formData);
  if (attached.length) {
    await db.guardianDocument.createMany({
      data: attached.map((entry) => ({
        guardianId: guardian.id,
        fileId: entry.fileId,
        category: entry.category,
        title: entry.title,
        uploadedById: user.id,
      })),
    });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "guardian.create",
      entity: "Guardian",
      entityId: guardian.id,
      summary: `Added guardian ${fields.firstName} ${fields.lastName}`,
    },
  });

  revalidatePath("/guardians");
  return { ok: true, guardianId: guardian.id };
}

export async function updateGuardianAction(
  _previous: GuardianState,
  formData: FormData,
): Promise<GuardianState> {
  let user;
  try {
    user = await authorize("student.guardian.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "No guardian given." };

  const fields = guardianFieldsFrom(formData);
  if (!fields.firstName || !fields.lastName) {
    return { error: "First and last name are required." };
  }
  if (!fields.phone) {
    return { error: "A guardian needs a phone number the school can reach." };
  }

  const clash = await db.guardian.findFirst({
    where: { phone: fields.phone, id: { not: id } },
    select: { firstName: true, lastName: true },
  });
  if (clash) {
    return {
      error: `That phone number belongs to ${clash.firstName} ${clash.lastName}. Two records with one number would split their fee history.`,
    };
  }

  try {
    await db.guardian.update({ where: { id }, data: fields });
  } catch (error) {
    return { error: (error as Error).message };
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "guardian.update",
      entity: "Guardian",
      entityId: id,
      summary: `Updated ${fields.firstName} ${fields.lastName}`,
    },
  });

  revalidatePath("/guardians");
  revalidatePath(`/guardians/${id}`);
  return { ok: true, message: "Saved." };
}

/**
 * Links a ward, with the relationship flags that decide who is billed, who is
 * called in an emergency and who may collect the child.
 */
export async function linkWardAction(
  _previous: GuardianState,
  formData: FormData,
): Promise<GuardianState> {
  let user;
  try {
    user = await authorize("student.guardian.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const guardianId = text(formData, "guardianId");
  const studentId = text(formData, "studentId");
  if (!guardianId || !studentId) return { error: "Choose a student." };

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { firstName: true, lastName: true },
  });
  if (!student) return { error: "Student not found." };

  await db.studentGuardian.upsert({
    where: { studentId_guardianId: { studentId, guardianId } },
    create: {
      studentId,
      guardianId,
      relation: (text(formData, "relation") || "GUARDIAN") as never,
      relationLabel: optional(formData, "relationLabel"),
      isPrimary: formData.get("isPrimary") === "on",
      isBillPayer: formData.get("isBillPayer") === "on",
      isEmergency: formData.get("isEmergency") === "on",
      canPickUp: formData.get("canPickUp") !== "off",
      receivesReports: true,
    },
    update: {
      relation: (text(formData, "relation") || "GUARDIAN") as never,
      relationLabel: optional(formData, "relationLabel"),
      isPrimary: formData.get("isPrimary") === "on",
      isBillPayer: formData.get("isBillPayer") === "on",
      isEmergency: formData.get("isEmergency") === "on",
    },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "student.guardian.link",
      entity: "Guardian",
      entityId: guardianId,
      summary: `Linked ward ${student.firstName} ${student.lastName}`,
    },
  });

  revalidatePath(`/guardians/${guardianId}`);
  revalidatePath(`/students/${studentId}`);
  return { ok: true, message: `${student.firstName} linked.` };
}

/**
 * Unlinks a ward. The guardian record survives — unlinking the last ward is
 * how a family that has left the school is wound down, and their fee history
 * still needs a name on it.
 */
export async function unlinkWardAction(formData: FormData): Promise<void> {
  const user = await authorize("student.guardian.manage");

  const guardianId = String(formData.get("guardianId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  if (!guardianId || !studentId) return;

  await db.studentGuardian.deleteMany({ where: { guardianId, studentId } });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "student.guardian.unlink",
      entity: "Guardian",
      entityId: guardianId,
      summary: "Unlinked a ward",
    },
  });

  revalidatePath(`/guardians/${guardianId}`);
  revalidatePath(`/students/${studentId}`);
}

/** Creates the portal login and links it to this guardian. */
export async function createGuardianLoginAction(
  _previous: GuardianState,
  formData: FormData,
): Promise<GuardianState> {
  let actor;
  try {
    actor = await authorize("user.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "No guardian given." };

  const guardian = await db.guardian.findUnique({
    where: { id },
    select: {
      firstName: true,
      lastName: true,
      otherNames: true,
      email: true,
      phone: true,
      userId: true,
      students: { select: { id: true } },
    },
  });
  if (!guardian) return { error: "Guardian not found." };
  if (guardian.userId) return { error: "This guardian already has an account." };
  if (!guardian.students.length) {
    return {
      error: "Link at least one ward first: a guardian portal with no children shows nothing.",
    };
  }

  const email = (text(formData, "email") || guardian.email || "").toLowerCase();
  const phone = normalisePhone(text(formData, "phone") || guardian.phone);
  if (!email && !phone) {
    return { error: "Give an email address or a phone number for the account." };
  }

  const clash = await db.user.findFirst({
    where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
    select: { id: true },
  });
  if (clash) return { error: "An account already exists with that email or phone." };

  // The guardian portal role, present in every seeded school. Created if a
  // school has deleted it, because the alternative is an account with no
  // permissions at all.
  const role =
    (await db.role.findFirst({ where: { portal: "GUARDIAN" }, select: { id: true } })) ??
    (await db.role.create({
      data: { key: "guardian", name: "Guardian", portal: "GUARDIAN", rank: 900 },
      select: { id: true },
    }));

  const temporaryPassword = `${generateCode(4)}-${generateCode(4)}`;
  const passwordHash = await hashPassword(temporaryPassword);

  const account = await db.user.create({
    data: {
      firstName: guardian.firstName,
      lastName: guardian.lastName,
      otherNames: guardian.otherNames,
      email: email || null,
      phone,
      passwordHash,
      mustChangePassword: true,
      status: "ACTIVE",
      portal: "GUARDIAN",
      roles: { create: [{ roleId: role.id }] },
      guardian: { connect: { id } },
    },
    select: { id: true },
  });

  await db.auditLog.create({
    data: {
      userId: actor.id,
      actorLabel: actor.fullName,
      action: "guardian.login.create",
      entity: "User",
      entityId: account.id,
      summary: `Created a portal login for ${guardian.firstName} ${guardian.lastName}`,
    },
  });

  revalidatePath(`/guardians/${id}`);
  return { ok: true, message: "Account created.", temporaryPassword };
}

/**
 * Switches a guardian off, or back on.
 *
 * This is what a school actually wants when a parent separates from the
 * family, moves abroad, or dies, and it is the answer to almost every request
 * that arrives as "delete this parent". Deleting is refused for anyone with a
 * ward or a payment against them, which is nearly everyone, and rightly: their
 * name is on the ledger and on their child's family record.
 *
 * Deactivating keeps all of that and stops the one thing that causes harm,
 * which is contact. An inactive guardian is not texted about an absence, not
 * sent a fee reminder, not emailed a report card, and is not the emergency
 * number printed on their child's ID card. The filters that make that true
 * live in @/lib/guardian-contact, and a build guard refuses any query that has
 * not decided.
 *
 * The portal login goes with it. A parent removed from a family should not be
 * able to sign in and read the child's marks the next morning, so the account
 * is disabled and every open session dropped. Reactivating restores the login,
 * because the usual reason to reactivate is that somebody did this by mistake.
 */
export async function setGuardianStatusAction(
  _previous: GuardianState,
  formData: FormData,
): Promise<GuardianState> {
  let user;
  try {
    user = await authorize("student.guardian.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "No guardian given." };

  const activating = text(formData, "active") === "1";

  // The reason is required going out and meaningless coming back: "why is this
  // parent inactive" is the first question the next member of staff asks, and
  // nothing else in the record answers it.
  let reason: string | null = null;
  if (!activating) {
    const chosen = text(formData, "reason");
    if (!chosen) return { error: "Choose why this guardian is being deactivated." };
    if (!DEACTIVATION_REASONS.some((entry) => entry.value === chosen)) {
      return { error: "That reason is not one of the options." };
    }
    if (chosen === "OTHER") {
      const note = text(formData, "note");
      if (!note) return { error: "Say what the reason is." };
      reason = note.slice(0, 200);
    } else {
      reason = chosen;
    }
  }

  const guardian = await db.guardian.findUnique({
    where: { id },
    select: { firstName: true, lastName: true, userId: true, isActive: true },
  });
  if (!guardian) return { error: "Guardian not found." };

  if (guardian.isActive === activating) {
    return {
      error: activating
        ? "That guardian is already active."
        : "That guardian is already deactivated.",
    };
  }

  await db.guardian.update({
    where: { id },
    data: {
      isActive: activating,
      // The database refuses a flag and a date that disagree, so these two
      // always move together.
      deactivatedAt: activating ? null : new Date(),
      deactivatedReason: reason,
    },
  });

  if (guardian.userId) {
    await db.user.update({
      where: { id: guardian.userId },
      data: { status: activating ? "ACTIVE" : "DISABLED" },
    });
    if (!activating) {
      await db.session.deleteMany({ where: { userId: guardian.userId } });
    }
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: activating ? "guardian.activate" : "guardian.deactivate",
      entity: "Guardian",
      entityId: id,
      summary: activating
        ? `${guardian.firstName} ${guardian.lastName} reactivated`
        : `${guardian.firstName} ${guardian.lastName} deactivated: ${describeDeactivation(reason).toLowerCase()}`,
    },
  });

  revalidatePath("/guardians");
  revalidatePath(`/guardians/${id}`);
  // The contact shown beside a pupil, and the family tab, both change.
  revalidatePath("/students");

  return {
    ok: true,
    message: activating
      ? "Guardian reactivated. Their login works again."
      : "Guardian deactivated. They will not be contacted, and their login is closed.",
  };
}

/**
 * Deletes a guardian nothing depends on. Payments and linked wards block it:
 * a record with money against it is financial history, not clutter.
 */
export async function deleteGuardianAction(formData: FormData): Promise<GuardianState> {
  let user;
  try {
    user = await authorize("student.guardian.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  if (!userCan(user, "student.delete")) {
    return {
      error: "Deleting people needs the “Delete student records” permission.",
    };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "No guardian given." };

  const guardian = await db.guardian.findUnique({
    where: { id },
    select: {
      firstName: true,
      lastName: true,
      userId: true,
      _count: { select: { students: true, payments: true } },
    },
  });
  if (!guardian) return { error: "Guardian not found." };

  if (guardian._count.students > 0) {
    return {
      error: `${guardian.firstName} ${guardian.lastName} is linked to ${guardian._count.students} ward${guardian._count.students === 1 ? "" : "s"}. Unlink them first.`,
    };
  }
  if (guardian._count.payments > 0) {
    return {
      error: `${guardian.firstName} ${guardian.lastName} has ${guardian._count.payments} payment${guardian._count.payments === 1 ? "" : "s"} on record. A payer's name stays on the ledger.`,
    };
  }

  await db.guardian.delete({ where: { id } });
  if (guardian.userId) {
    await db.session.deleteMany({ where: { userId: guardian.userId } });
    await db.user.update({ where: { id: guardian.userId }, data: { status: "DISABLED" } });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "guardian.delete",
      entity: "Guardian",
      entityId: id,
      summary: `Deleted ${guardian.firstName} ${guardian.lastName}`,
    },
  });

  revalidatePath("/guardians");
  return { ok: true, message: "Guardian deleted." };
}
