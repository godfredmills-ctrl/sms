import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PortalType } from "@prisma/client";

import { db } from "./db";
import { env } from "./env";
import { generateToken, hashToken, verifyPassword } from "./crypto";
import { can, canAll, canAny, isSuperAdmin, type Grantee } from "./rbac";
import { normalisePhone } from "./utils";

export const SESSION_COOKIE = "sms_session";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl: string | null;
  portal: PortalType;
  mustChangePassword: boolean;
  roleKeys: string[];
  roleNames: string[];
  permissions: Set<string>;
  /** Set when the account is linked to a staff/student/guardian record. */
  staffId: string | null;
  studentId: string | null;
  guardianId: string | null;
  sessionId: string;
};

// -----------------------------------------------------------------------------
// Session lifecycle
// -----------------------------------------------------------------------------

/**
 * @param remember  Whether the person asked to stay signed in. The login form
 *   has offered that choice since it was written and nothing ever read it, so
 *   every session lasted the full TTL — including one started on the shared
 *   machine in the staff room by someone who had deliberately unticked the box.
 *   Unticked now means a session cookie: gone when the browser closes.
 */
export async function createSession(userId: string, remember = true): Promise<string> {
  const token = generateToken(48);
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 24 * 60 * 60 * 1000);
  const headerList = await headers();

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: clientIp(headerList),
      userAgent: headerList.get("user-agent")?.slice(0, 500) ?? null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    // The row still expires at the TTL either way — this only decides whether
    // the browser keeps the cookie after it is closed.
    ...(remember ? { expires: expiresAt } : {}),
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    await db.session
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  cookieStore.delete(SESSION_COOKIE);
}

/** Revokes every other session for a user — used after a password change. */
export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { userId, id: { not: keepSessionId }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// -----------------------------------------------------------------------------
// Current user
// -----------------------------------------------------------------------------

/**
 * Memoised per request: a page and its nested layouts all call this, and
 * without `cache` that would be one database round-trip each.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          roles: {
            include: {
              role: { include: { permissions: { include: { permission: true } } } },
            },
          },
          staff: { select: { id: true } },
          student: { select: { id: true } },
          guardian: { select: { id: true } },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;

  // Keep `lastActiveAt` roughly current without writing on every request.
  if (Date.now() - session.lastActiveAt.getTime() > 5 * 60 * 1000) {
    void db.session
      .update({ where: { id: session.id }, data: { lastActiveAt: new Date() } })
      .catch(() => undefined);
  }

  const { user } = session;
  const permissions = new Set<string>();
  for (const link of user.roles) {
    for (const rolePermission of link.role.permissions) {
      permissions.add(rolePermission.permission.key);
    }
  }

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    avatarUrl: user.avatarUrl,
    portal: user.portal,
    mustChangePassword: user.mustChangePassword,
    roleKeys: user.roles.map((link) => link.role.key),
    roleNames: user.roles.map((link) => link.role.name),
    permissions,
    staffId: user.staff?.id ?? null,
    studentId: user.student?.id ?? null,
    guardianId: user.guardian?.id ?? null,
    sessionId: session.id,
  };
});

// -----------------------------------------------------------------------------
// Guards
// -----------------------------------------------------------------------------

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(
  permission: string | string[],
  mode: "any" | "all" = "any",
): Promise<AuthUser> {
  const user = await requireUser();
  const permissions = Array.isArray(permission) ? permission : [permission];
  const allowed = mode === "all" ? canAll(user, permissions) : canAny(user, permissions);
  if (!allowed) redirect("/forbidden");
  return user;
}

export async function requirePortal(portal: PortalType): Promise<AuthUser> {
  const user = await requireUser();
  if (user.portal !== portal && !isSuperAdmin(user)) redirect("/forbidden");
  return user;
}

/**
 * For server actions and route handlers, which should return an error rather
 * than redirect. Throws `AuthError`, caught by the action wrapper.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: "UNAUTHENTICATED" | "FORBIDDEN" = "FORBIDDEN",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function authorize(permission?: string | string[]): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("You must be signed in.", "UNAUTHENTICATED");
  if (!permission) return user;

  const permissions = Array.isArray(permission) ? permission : [permission];
  if (!canAny(user, permissions)) {
    throw new AuthError("You do not have permission to perform this action.");
  }
  return user;
}

export function userCan(user: AuthUser | Grantee | null, permission: string): boolean {
  if (!user) return false;
  return can(user, permission);
}

export function userCanAny(user: AuthUser | Grantee | null, permissions: string[]): boolean {
  if (!user) return false;
  return canAny(user, permissions);
}

// -----------------------------------------------------------------------------
// Sign in
// -----------------------------------------------------------------------------

export type LoginResult =
  | { ok: true; userId: string; mustChangePassword: boolean; portal: PortalType }
  | { ok: false; error: string };

/**
 * Accepts an email, a username, or a phone number in any common Ghanaian
 * format — guardians in particular know their phone number, not an email.
 */
export async function attemptLogin(
  identifier: string,
  password: string,
): Promise<LoginResult> {
  const trimmed = identifier.trim();
  if (!trimmed || !password) {
    return { ok: false, error: "Enter your credentials to continue." };
  }

  const normalisedPhone = normalisePhone(trimmed);
  const user = await db.user.findFirst({
    where: {
      OR: [
        { email: trimmed.toLowerCase() },
        { username: trimmed.toLowerCase() },
        ...(normalisedPhone ? [{ phone: normalisedPhone }] : []),
      ],
    },
  });

  // Same message for "no such user" and "wrong password" so the login form
  // cannot be used to enumerate who has an account.
  const genericError = "Incorrect credentials. Please try again.";
  if (!user) return { ok: false, error: genericError };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return {
      ok: false,
      error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  if (user.status === "SUSPENDED" || user.status === "DISABLED") {
    return { ok: false, error: "This account is not active. Contact the school office." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failedAttempts = user.failedAttempts + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedAttempts,
        lockedUntil:
          failedAttempts >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
            : null,
      },
    });
    return { ok: false, error: genericError };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      // An invited user becomes active on first successful sign-in.
      status: user.status === "INVITED" ? "ACTIVE" : user.status,
    },
  });

  return {
    ok: true,
    userId: user.id,
    mustChangePassword: user.mustChangePassword,
    portal: user.portal,
  };
}

/** Where a user lands after signing in, based on their portal. */
export function landingPath(portal: PortalType): string {
  switch (portal) {
    case "STUDENT":
      return "/portal/student";
    case "GUARDIAN":
      return "/portal/guardian";
    default:
      return "/dashboard";
  }
}

function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headerList.get("x-real-ip");
}

export { clientIp };
