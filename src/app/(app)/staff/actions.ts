"use server";

import { revalidatePath } from "next/cache";

import { authorize, userCan } from "@/lib/auth";
import { generateCode, hashPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { normalisePhone } from "@/lib/utils";

export type StaffState = {
  ok?: boolean;
  error?: string;
  message?: string;
  staffId?: string;
  staffNo?: string;
  /** Shown once, on screen, when an account is created. */
  temporaryPassword?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

function dateOf(formData: FormData, key: string): Date | null {
  const value = text(formData, key);
  return value ? new Date(value) : null;
}

/**
 * Next staff number, of the form GCS/STF/014.
 *
 * Derived from the count and retried on collision, the same way admission
 * numbers are: two people adding staff at once will occasionally land on the
 * same number, and a unique-constraint error is not something an administrator
 * should have to interpret.
 */
async function nextStaffNo(prefix: string, attempt = 0): Promise<string> {
  const count = await db.staff.count();
  return `${prefix}/STF/${String(count + 1 + attempt).padStart(3, "0")}`;
}

async function staffNoPrefix(): Promise<string> {
  const school = await db.school.findFirst({ select: { shortName: true, name: true } });
  const source = school?.shortName || school?.name || "SCH";
  // Initials of the school name: "Golden Crest International School" -> GCIS.
  const initials = source
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return (initials || "SCH").slice(0, 5);
}

/**
 * Fields shared by create and edit.
 *
 * One function so the two cannot drift: a field added to the form and to
 * create but not to update is the ordinary way an edit screen quietly stops
 * saving half of what it shows.
 */
function staffFieldsFrom(formData: FormData) {
  return {
    title: optional(formData, "title"),
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    otherNames: optional(formData, "otherNames"),
    gender: (text(formData, "gender") || "UNDISCLOSED") as never,
    dateOfBirth: dateOf(formData, "dateOfBirth"),
    photoUrl: optional(formData, "photoUrl"),

    email: optional(formData, "email"),
    phone: normalisePhone(text(formData, "phone")),
    altPhone: normalisePhone(text(formData, "altPhone")),
    address: optional(formData, "address"),
    digitalAddr: optional(formData, "digitalAddr"),
    nationality: text(formData, "nationality") || "Ghanaian",
    nationalId: optional(formData, "nationalId"),
    ssnitNumber: optional(formData, "ssnitNumber"),
    tin: optional(formData, "tin"),

    jobTitle: optional(formData, "jobTitle"),
    department: optional(formData, "department"),
    employmentType: (text(formData, "employmentType") || "FULL_TIME") as never,
    hireDate: dateOf(formData, "hireDate"),
    isTeaching: formData.get("isTeaching") === "on",
    specialisations: formData
      .getAll("specialisations")
      .map(String)
      .filter(Boolean),

    emergencyName: optional(formData, "emergencyName"),
    emergencyPhone: normalisePhone(text(formData, "emergencyPhone")),
    emergencyRelation: optional(formData, "emergencyRelation"),

    notes: optional(formData, "notes"),
  };
}

export async function createStaffAction(
  _previous: StaffState,
  formData: FormData,
): Promise<StaffState> {
  let user;
  try {
    user = await authorize("staff.create");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const fields = staffFieldsFrom(formData);
  if (!fields.firstName || !fields.lastName) {
    return { error: "First and last name are required." };
  }

  const prefix = await staffNoPrefix();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const staffNo = text(formData, "staffNo") || (await nextStaffNo(prefix, attempt));

    try {
      const staff = await db.staff.create({
        data: {
          ...fields,
          staffNo,
          status: (text(formData, "status") || "ACTIVE") as never,
        },
      });

      await db.auditLog.create({
        data: {
          userId: user.id,
          actorLabel: user.fullName,
          action: "staff.create",
          entity: "Staff",
          entityId: staff.id,
          summary: `Added ${fields.firstName} ${fields.lastName} (${staffNo})`,
        },
      });

      revalidatePath("/staff");
      return { ok: true, staffId: staff.id, staffNo };
    } catch (error) {
      const message = (error as Error).message;
      // A clash on the generated number is expected under concurrency; a clash
      // on one somebody typed is theirs to resolve.
      if (message.includes("staffNo") && !text(formData, "staffNo")) continue;
      if (message.includes("staffNo")) {
        return { error: `Staff number ${staffNo} is already in use.` };
      }
      return { error: message };
    }
  }

  return { error: "Could not allocate a staff number. Try again." };
}

export async function updateStaffAction(
  _previous: StaffState,
  formData: FormData,
): Promise<StaffState> {
  let user;
  try {
    user = await authorize("staff.update");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  if (!id) return { error: "No staff record given." };

  const fields = staffFieldsFrom(formData);
  if (!fields.firstName || !fields.lastName) {
    return { error: "First and last name are required." };
  }

  try {
    await db.staff.update({ where: { id }, data: fields });
  } catch (error) {
    return { error: (error as Error).message };
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "staff.update",
      entity: "Staff",
      entityId: id,
      summary: `Updated ${fields.firstName} ${fields.lastName}`,
    },
  });

  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
  return { ok: true, message: "Saved." };
}

/**
 * Employment status, including leaving.
 *
 * Separate from the profile edit because it is a different act: correcting a
 * spelling and recording that somebody has resigned should not be the same
 * button. Suspending or ending employment also revokes live sessions — an
 * account that stays signed in until its cookie expires is not suspended.
 */
export async function setStaffStatusAction(
  _previous: StaffState,
  formData: FormData,
): Promise<StaffState> {
  let user;
  try {
    user = await authorize("staff.update");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = text(formData, "id");
  const status = text(formData, "status");
  if (!id || !status) return { error: "Choose a status." };

  const staff = await db.staff.findUnique({
    where: { id },
    select: { userId: true, firstName: true, lastName: true },
  });
  if (!staff) return { error: "Staff record not found." };

  const hasLeft = ["RESIGNED", "TERMINATED", "RETIRED"].includes(status);
  const locked = hasLeft || status === "SUSPENDED";

  await db.staff.update({
    where: { id },
    data: {
      status: status as never,
      exitDate: hasLeft ? (dateOf(formData, "exitDate") ?? new Date()) : null,
      exitReason: hasLeft ? optional(formData, "exitReason") : null,
    },
  });

  if (staff.userId && locked) {
    await db.user.update({
      where: { id: staff.userId },
      data: { status: hasLeft ? "DISABLED" : "SUSPENDED" },
    });
    await db.session.deleteMany({ where: { userId: staff.userId } });
  } else if (staff.userId && status === "ACTIVE") {
    await db.user.update({ where: { id: staff.userId }, data: { status: "ACTIVE" } });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "staff.status",
      entity: "Staff",
      entityId: id,
      summary: `${staff.firstName} ${staff.lastName} set to ${status.toLowerCase().replace("_", " ")}`,
    },
  });

  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
  return { ok: true, message: "Status updated." };
}

/**
 * Deletes a staff record, but only one nothing depends on.
 *
 * A teacher's row is referenced by the registers they took, the marks they
 * gave and the classes they are form teacher of, and those relations are
 * SetNull rather than Cascade — so deleting is not blocked by the database. It
 * just anonymises a term of attendance and a year of grades, with no
 * indication that it did. Marking somebody RESIGNED is what a school actually
 * means; deletion is for the record created by mistake this morning.
 */
export async function deleteStaffAction(formData: FormData): Promise<StaffState> {
  let user;
  try {
    user = await authorize("staff.delete");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "No staff record given." };

  const staff = await db.staff.findUnique({
    where: { id },
    select: {
      firstName: true,
      lastName: true,
      staffNo: true,
      userId: true,
      _count: {
        select: {
          offerings: true,
          formClasses: true,
          takenAttendance: true,
          gradedScores: true,
        },
      },
    },
  });
  if (!staff) return { error: "Staff record not found." };

  const history = [
    [staff._count.takenAttendance, "attendance session"],
    [staff._count.gradedScores, "graded score"],
    [staff._count.offerings, "class assignment"],
    [staff._count.formClasses, "form class"],
  ] as const;

  const blocking = history
    .filter(([count]) => count > 0)
    .map(([count, noun]) => `${count} ${noun}${count === 1 ? "" : "s"}`);

  if (blocking.length) {
    return {
      error: `${staff.firstName} ${staff.lastName} has ${blocking.join(", ")} on record. Deleting would leave that history with no name against it. Set their status to Resigned or Retired instead — the record stays, and they lose access.`,
    };
  }

  await db.staff.delete({ where: { id } });
  if (staff.userId) {
    await db.session.deleteMany({ where: { userId: staff.userId } });
    await db.user.update({ where: { id: staff.userId }, data: { status: "DISABLED" } });
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "staff.delete",
      entity: "Staff",
      entityId: id,
      summary: `Deleted ${staff.firstName} ${staff.lastName} (${staff.staffNo})`,
    },
  });

  revalidatePath("/staff");
  return { ok: true, message: "Staff record deleted." };
}

/**
 * Creates the login for a staff member and links it to their record.
 *
 * Not routed through inviteUserAction, which creates a User and leaves
 * Staff.userId null — the account it produces can sign in and then cannot take
 * a register or open a gradebook, because every one of those checks reads
 * user.staffId. Both pages used to tell administrators to create accounts
 * under Users & roles, which is exactly how that broken state was reached.
 */
export async function createStaffLoginAction(
  _previous: StaffState,
  formData: FormData,
): Promise<StaffState> {
  let actor;
  try {
    actor = await authorize("user.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  // Same rule as inviting a user: handing out a role takes the role permission,
  // whether the account is new or existing.
  if (!userCan(actor, "user.role.manage")) {
    return {
      error:
        "You can manage staff but not decide account roles. Ask someone with the “Assign roles to users” permission.",
    };
  }

  const id = text(formData, "id");
  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);
  if (!id) return { error: "No staff record given." };
  if (!roleIds.length) return { error: "Assign at least one role." };

  const staff = await db.staff.findUnique({
    where: { id },
    select: { firstName: true, lastName: true, otherNames: true, email: true, phone: true, userId: true },
  });
  if (!staff) return { error: "Staff record not found." };
  if (staff.userId) return { error: "This person already has an account." };

  const email = (text(formData, "email") || staff.email || "").toLowerCase();
  const phone = normalisePhone(text(formData, "phone") || staff.phone);
  if (!email && !phone) {
    return { error: "Give an email address or a phone number for the account." };
  }

  const clash = await db.user.findFirst({
    where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
    select: { id: true },
  });
  if (clash) return { error: "An account already exists with that email or phone." };

  const temporaryPassword = `${generateCode(4)}-${generateCode(4)}`;
  const passwordHash = await hashPassword(temporaryPassword);

  const account = await db.user.create({
    data: {
      firstName: staff.firstName,
      lastName: staff.lastName,
      otherNames: staff.otherNames,
      email: email || null,
      phone,
      passwordHash,
      mustChangePassword: true,
      status: "ACTIVE",
      portal: "STAFF",
      roles: { create: roleIds.map((roleId) => ({ roleId })) },
      // The link inviteUserAction never makes.
      staff: { connect: { id } },
    },
    select: { id: true },
  });

  await db.auditLog.create({
    data: {
      userId: actor.id,
      actorLabel: actor.fullName,
      action: "staff.login.create",
      entity: "User",
      entityId: account.id,
      summary: `Created a login for ${staff.firstName} ${staff.lastName}`,
    },
  });

  revalidatePath(`/staff/${id}`);
  return {
    ok: true,
    message: "Account created.",
    temporaryPassword,
  };
}
