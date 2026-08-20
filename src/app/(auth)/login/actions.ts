"use server";

import { redirect } from "next/navigation";

import { attemptLogin, createSession, landingPath } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { headers } from "next/headers";

export type LoginState = { error?: string };

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const result = await attemptLogin(identifier, password);

  if (!result.ok) {
    // Failed attempts are worth recording — repeated failures on one account
    // are how a school notices a shared or compromised login.
    const headerList = await headers();
    await db.auditLog
      .create({
        data: {
          action: "auth.login.failed",
          summary: `Failed sign-in for "${identifier}"`,
          ipAddress: clientIp(headerList),
          userAgent: headerList.get("user-agent")?.slice(0, 500) ?? null,
        },
      })
      .catch(() => undefined);

    return { error: result.error };
  }

  await createSession(result.userId, formData.get("remember") === "on");

  await db.auditLog
    .create({
      data: {
        userId: result.userId,
        action: "auth.login",
        summary: "Signed in",
      },
    })
    .catch(() => undefined);

  // /account#password, not /account/password — there is no such route, and
  // there never was. Every account this system creates is born with
  // mustChangePassword set (staff, guardian, student, invite, admin reset),
  // so this line was the first screen every new user ever saw: the catch-all
  // "nothing is served here" page. They never reached the change-password
  // form, and the change was therefore never made — the temporary password
  // stayed live and went on working.
  if (result.mustChangePassword) redirect("/account#password");

  // Only allow same-origin relative paths, so `?next=` cannot be used to
  // bounce a signed-in user to an attacker's site.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : null;
  redirect(safeNext ?? landingPath(result.portal));
}
