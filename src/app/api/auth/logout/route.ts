import { NextResponse } from "next/server";

import { destroySession, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Signs the user out.
 *
 * The redirect sends a **relative** Location. Every absolute alternative is
 * wrong somewhere:
 *
 * - `env.appUrl` is a configured constant, so a stale APP_URL throws the user
 *   onto whatever else is running at that address.
 * - `request.url` is the address the *container* was reached on. Behind a
 *   proxy — which is every real deployment — that is the internal bind
 *   address, and the browser is handed `https://0.0.0.0:8080/login`.
 *
 * A relative Location is resolved by the browser against the URL it actually
 * used, which is the only origin guaranteed to be correct. RFC 7231 has
 * permitted this since 2014 and every browser has always accepted it.
 */
function toLogin() {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/login", "Cache-Control": "no-store" },
  });
}

export async function POST() {
  const user = await getCurrentUser().catch(() => null);

  if (user) {
    await db.auditLog
      .create({ data: { userId: user.id, action: "auth.logout", summary: "Signed out" } })
      .catch(() => undefined);
  }

  await destroySession().catch(() => undefined);

  return toLogin();
}

/**
 * A bare link to this path, or a reload after signing out, would otherwise get
 * a 405. The login page is where they were trying to go.
 */
export async function GET() {
  return toLogin();
}
