"use server";

import { revalidatePath } from "next/cache";

import { authorize, userCan } from "@/lib/auth";
import { generateCode, hashPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { normalisePhone } from "@/lib/utils";

export type UserState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Shown once, on screen, so an administrator can hand it over. */
  temporaryPassword?: string;
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function inviteUserAction(
  _previous: UserState,
  formData: FormData,
): Promise<UserState> {
  let actor;
  try {
    actor = await authorize("user.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  const email = text(formData, "email").toLowerCase();
  const phone = normalisePhone(text(formData, "phone"));
  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);

  if (!firstName || !lastName) return { error: "First and last name are required." };
  if (!email && !phone) return { error: "Give an email address or a phone number." };
  if (!roleIds.length) return { error: "Assign at least one role." };

  // Handing out a role is the same act whether the account is new or existing,
  // so it takes the same permission. It did not: changing an existing user's
  // roles required user.role.manage, while creating one required only
  // user.manage — and creation takes a roleIds list. Anyone who could add a
  // colleague could add a colleague who is a super_admin, or invite a second
  // account for themselves and sign in as it. The narrower permission was
  // guarding the door beside an open window.
  if (!userCan(actor, "user.role.manage")) {
    return {
      error:
        "You can create accounts but not decide their roles. Ask someone with the “Assign roles to users” permission to do this, or to grant it to you.",
    };
  }

  const clash = await db.user.findFirst({
    where: {
      OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    },
    select: { id: true },
  });
  if (clash) return { error: "An account already exists with that email or phone." };

  // A random password issued once, with mustChangePassword set: the account is
  // usable immediately even where email delivery is not configured, and the
  // credential the administrator saw stops working at first sign-in.
  const temporaryPassword = `${generateCode(4)}-${generateCode(4)}`;
  const passwordHash = await hashPassword(temporaryPassword);

  const roles = await db.role.findMany({
    where: { id: { in: roleIds } },
    select: { id: true, portal: true },
  });

  const user = await db.user.create({
    data: {
      firstName,
      lastName,
      otherNames: text(formData, "otherNames") || null,
      email: email || null,
      phone,
      passwordHash,
      mustChangePassword: true,
      status: "ACTIVE",
      portal: roles[0]?.portal ?? "STAFF",
      roles: {
        create: roles.map((role) => ({ roleId: role.id, assignedBy: actor.id })),
      },
    },
  });

  await db.auditLog.create({
    data: {
      userId: actor.id,
      action: "user.invite",
      entity: "User",
      entityId: user.id,
      summary: `Created account for ${firstName} ${lastName}`,
    },
  });

  revalidatePath("/users");
  return {
    ok: true,
    message: `Account created for ${firstName} ${lastName}.`,
    temporaryPassword,
  };
}

export async function setUserRolesAction(formData: FormData) {
  const actor = await authorize("user.role.manage");

  const userId = text(formData, "userId");
  if (!userId) return;

  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, roles: { select: { role: { select: { key: true } } } } },
  });
  if (!target) return;

  // Guard the last administrator. Locking everyone out of role management is
  // only recoverable from the database, so the transition is refused here
  // rather than discovered later.
  const wasAdmin = target.roles.some((entry) => entry.role.key === "super_admin");
  if (wasAdmin) {
    const keptAdmin = await db.role.findFirst({
      where: { key: "super_admin", id: { in: roleIds } },
      select: { id: true },
    });
    if (!keptAdmin) {
      const admins = await db.userRole.count({
        where: { role: { key: "super_admin" } },
      });
      if (admins <= 1) return;
    }
  }

  await db.$transaction([
    db.userRole.deleteMany({ where: { userId } }),
    db.userRole.createMany({
      data: roleIds.map((roleId) => ({ userId, roleId, assignedBy: actor.id })),
      skipDuplicates: true,
    }),
  ]);

  await db.auditLog.create({
    data: {
      userId: actor.id,
      action: "user.role.assign",
      entity: "User",
      entityId: userId,
      summary: `Set ${roleIds.length} role(s)`,
    },
  });

  revalidatePath("/users");
}

export async function setUserStatusAction(formData: FormData) {
  const actor = await authorize("user.manage");

  const userId = text(formData, "userId");
  const status = text(formData, "status");
  if (!userId || !status) return;
  if (userId === actor.id) return; // never lock yourself out

  await db.user.update({
    where: { id: userId },
    data: { status: status as never },
  });

  // Suspending an account must end the sessions it already holds, otherwise
  // the person stays signed in until their cookie happens to expire.
  if (status !== "ACTIVE") {
    await db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await db.auditLog.create({
    data: {
      userId: actor.id,
      action: "user.status",
      entity: "User",
      entityId: userId,
      summary: `Set status to ${status}`,
    },
  });

  revalidatePath("/users");
}

export async function resetPasswordAction(
  _previous: UserState,
  formData: FormData,
): Promise<UserState> {
  let actor;
  try {
    actor = await authorize("user.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const userId = text(formData, "userId");
  if (!userId) return { error: "Missing user." };

  const temporaryPassword = `${generateCode(4)}-${generateCode(4)}`;

  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });

  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await db.auditLog.create({
    data: {
      userId: actor.id,
      action: "user.password.reset",
      entity: "User",
      entityId: userId,
      summary: "Issued a temporary password",
    },
  });

  revalidatePath("/users");
  return { ok: true, message: "Temporary password issued.", temporaryPassword };
}

// -----------------------------------------------------------------------------
// Roles
// -----------------------------------------------------------------------------

export type RoleState = { ok?: boolean; error?: string; message?: string };

export async function createRoleAction(
  _previous: RoleState,
  formData: FormData,
): Promise<RoleState> {
  try {
    await authorize("user.role.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const name = text(formData, "name");
  if (!name) return { error: "Name the role." };

  const key = text(formData, "key") || name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const clash = await db.role.findUnique({ where: { key } });
  if (clash) return { error: `A role with the key "${key}" already exists.` };

  await db.role.create({
    data: {
      key,
      name,
      description: text(formData, "description") || null,
      portal: (text(formData, "portal") || "STAFF") as never,
      rank: Number(text(formData, "rank")) || 100,
    },
  });

  revalidatePath("/users/roles");
  return { ok: true, message: `Created "${name}". Now choose its permissions.` };
}

export async function setRolePermissionsAction(formData: FormData) {
  const actor = await authorize("user.role.manage");

  const roleId = text(formData, "roleId");
  if (!roleId) return;

  const keys = formData.getAll("permissions").map(String).filter(Boolean);
  const valid = new Set(PERMISSIONS.map((permission) => permission.key));
  const wanted = keys.filter((key) => valid.has(key));

  const role = await db.role.findUnique({
    where: { id: roleId },
    select: { key: true, name: true },
  });
  if (!role) return;

  // super_admin bypasses the permission table entirely in `can()`, so editing
  // its rows would imply a restriction the code does not honour.
  if (role.key === "super_admin") return;

  const permissions = await db.permission.findMany({
    where: { key: { in: wanted } },
    select: { id: true },
  });

  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId } }),
    db.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    }),
  ]);

  await db.auditLog.create({
    data: {
      userId: actor.id,
      action: "user.role.permissions",
      entity: "Role",
      entityId: roleId,
      summary: `${role.name}: ${permissions.length} permissions`,
    },
  });

  revalidatePath("/users/roles");
}

export async function revokeSessionAction(formData: FormData) {
  const actor = await authorize("user.manage");
  const sessionId = text(formData, "sessionId");
  if (!sessionId) return;

  await db.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });

  await db.auditLog.create({
    data: {
      userId: actor.id,
      action: "user.session.revoke",
      entity: "Session",
      entityId: sessionId,
      summary: "Revoked a session",
    },
  });

  revalidatePath("/users");
}
