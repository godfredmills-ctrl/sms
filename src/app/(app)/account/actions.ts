"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { normalisePhone } from "@/lib/utils";

export type AccountState = { ok?: boolean; error?: string; message?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function updateProfileAction(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();

  const firstName = text(formData, "firstName");
  const lastName = text(formData, "lastName");
  if (!firstName || !lastName) return { error: "A name is required." };

  const email = text(formData, "email").toLowerCase();
  const phone = normalisePhone(text(formData, "phone"));

  // Email and phone are sign-in identifiers, so a clash has to be caught here
  // rather than surfacing as a raw unique-constraint error.
  if (email) {
    const clash = await db.user.findFirst({
      where: { email, id: { not: user.id } },
      select: { id: true },
    });
    if (clash) return { error: "That email address is already in use." };
  }
  if (phone) {
    const clash = await db.user.findFirst({
      where: { phone, id: { not: user.id } },
      select: { id: true },
    });
    if (clash) return { error: "That phone number is already in use." };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      firstName,
      lastName,
      otherNames: text(formData, "otherNames") || null,
      email: email || null,
      phone,
      avatarUrl: text(formData, "avatarUrl") || null,
      locale: text(formData, "locale") || "en-GH",
      timezone: text(formData, "timezone") || "Africa/Accra",
    },
  });

  revalidatePath("/account");
  return { ok: true, message: "Profile saved." };
}

export async function changePasswordAction(
  _previous: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();

  const current = text(formData, "currentPassword");
  const next = text(formData, "newPassword");
  const confirm = text(formData, "confirmPassword");

  if (!next) return { error: "Enter a new password." };
  if (next !== confirm) return { error: "The two new passwords do not match." };
  if (next.length < 10) {
    return { error: "Use at least 10 characters — length beats complexity." };
  }
  if (next === current) return { error: "The new password must be different." };

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (record?.passwordHash) {
    const valid = await verifyPassword(current, record.passwordHash);
    if (!valid) return { error: "Your current password is not correct." };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
    },
  });

  // Every other session is ended. If the old password leaked, changing it has
  // to actually evict whoever was using it.
  const sessions = await db.session.findMany({
    where: { userId: user.id, revokedAt: null },
    select: { id: true },
  });

  await db.session.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await db.auditLog.create({
    data: {
      userId: user.id,
      actorLabel: user.fullName,
      action: "user.password.change",
      entity: "User",
      entityId: user.id,
      summary: `Changed own password; ended ${sessions.length} session(s)`,
    },
  });

  return {
    ok: true,
    message:
      "Password changed. You have been signed out everywhere else — sign in again on those devices.",
  };
}

export async function updateNotificationPreferenceAction(formData: FormData) {
  const user = await requireUser();

  const category = text(formData, "category");
  const channel = text(formData, "channel");
  if (!category || !channel) return;

  const existing = await db.notificationPreference.findUnique({
    where: {
      userId_category_channel: {
        userId: user.id,
        category,
        channel: channel as never,
      },
    },
    select: { enabled: true },
  });

  await db.notificationPreference.upsert({
    where: {
      userId_category_channel: {
        userId: user.id,
        category,
        channel: channel as never,
      },
    },
    create: {
      userId: user.id,
      category,
      channel: channel as never,
      enabled: false,
    },
    update: { enabled: !(existing?.enabled ?? true) },
  });

  revalidatePath("/account");
}

export async function revokeOwnSessionAction(formData: FormData) {
  const user = await requireUser();

  const id = text(formData, "id");
  if (!id) return;

  await db.session.updateMany({
    where: { id, userId: user.id },
    data: { revokedAt: new Date() },
  });

  revalidatePath("/account");
}
