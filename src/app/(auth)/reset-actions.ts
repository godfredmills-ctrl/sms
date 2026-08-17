"use server";

import { generateToken, hashPassword, hashToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail, sendSms } from "@/lib/messaging/providers";
import { normalisePhone } from "@/lib/utils";

export type ResetState = { ok?: boolean; error?: string };

/**
 * Starts a password reset for whoever owns the address given.
 *
 * The reply never says whether an account exists — "check your messages" is
 * the answer either way, because a login page that confirms which addresses
 * have accounts is a directory of the school's parents for whoever asks.
 *
 * The token is stored hashed, single-use, and dies in an hour. It travels by
 * email when the account has one, by SMS otherwise — a Ghanaian parent's
 * account is as likely to be a phone number as an address.
 */
export async function requestPasswordResetAction(
  _previous: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier) return { error: "Enter the email or phone number you sign in with." };

  const email = identifier.includes("@") ? identifier.toLowerCase() : null;
  const phone = email ? null : normalisePhone(identifier);

  const user = await db.user.findFirst({
    where: email ? { email } : phone ? { phone } : { id: "___none___" },
    select: { id: true, email: true, phone: true, status: true, firstName: true },
  });

  // The generic answer, decided before anything might fail differently for
  // real and unreal accounts.
  const done = { ok: true as const };

  if (!user || user.status !== "ACTIVE") {
    // The unreal-account path must cost about what the real one costs, or
    // response timing answers the question the message refuses to. Hashing a
    // throwaway token approximates the real path's work.
    hashToken(generateToken(32));
    return done;
  }

  // One live reset at a time, and no more than three requests an hour: a
  // reset form is also a free SMS cannon pointed at any number typed into it.
  const recent = await db.verificationToken.count({
    where: {
      userId: user.id,
      purpose: "password_reset",
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recent >= 3) return done;

  const token = generateToken(32);
  await db.verificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      purpose: "password_reset",
      target: user.email ?? user.phone,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const link = `${env.appUrl}/reset-password/${token}`;

  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: "Reset your password",
      text: `Hello ${user.firstName},\n\nSomeone asked to reset the password for this account. If it was you, open this link within the hour:\n\n${link}\n\nIf it was not you, ignore this message — nothing has changed.`,
      html: `<p>Hello ${user.firstName},</p><p>Someone asked to reset the password for this account. If it was you, open this link within the hour:</p><p><a href="${link}">${link}</a></p><p>If it was not you, ignore this message — nothing has changed.</p>`,
    }).catch(() => undefined);
  } else if (user.phone) {
    await sendSms({
      to: user.phone,
      message: `Password reset requested. Open ${link} within 1 hour. Ignore this if it was not you.`,
    }).catch(() => undefined);
  }

  return done;
}

/** The token's owner, if the token is still good. Read-only, for the page. */
export async function resetTokenOwner(token: string) {
  const record = await db.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      purpose: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { firstName: true } },
    },
  });

  if (
    !record ||
    record.purpose !== "password_reset" ||
    record.usedAt ||
    record.expiresAt < new Date() ||
    !record.user
  ) {
    return null;
  }
  return { firstName: record.user.firstName };
}

export async function completePasswordResetAction(
  _previous: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "The new password needs at least eight characters." };
  }
  if (password !== confirm) return { error: "The two passwords do not match." };

  const record = await db.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, purpose: true, expiresAt: true, usedAt: true, userId: true },
  });

  if (
    !record ||
    record.purpose !== "password_reset" ||
    record.usedAt ||
    record.expiresAt < new Date() ||
    !record.userId
  ) {
    return { error: "This reset link has expired or been used. Request a new one." };
  }

  const passwordHash = await hashPassword(password);

  // The reset also unlocks the account and ends every live session — the
  // person most likely resetting in a hurry is one whose password someone
  // else may be holding.
  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        failedAttempts: 0,
        lockedUntil: null,
      },
    }),
    db.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  await db.auditLog.create({
    data: {
      userId: record.userId,
      action: "auth.password.reset",
      entity: "User",
      entityId: record.userId,
      summary: "Password reset via emailed link",
    },
  });

  return { ok: true };
}
