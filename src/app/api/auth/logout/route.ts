import { NextResponse } from "next/server";

import { destroySession, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Signs the user out.
 *
 * The redirect is built from the **request's own origin**, not from APP_URL.
 * Using the configured value means a stale or wrong APP_URL sends someone
 * signing out to a different site entirely — which is a confusing 404 at best,
 * and at worst hands their next click to whatever is running on that address.
 * Wherever they signed out is where they should land.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser().catch(() => null);

  if (user) {
    await db.auditLog
      .create({ data: { userId: user.id, action: "auth.logout", summary: "Signed out" } })
      .catch(() => undefined);
  }

  await destroySession().catch(() => undefined);

  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

/**
 * A browser that follows a bare link to this path, or a user who reloads after
 * signing out, would otherwise get a bare 405. Sending them to the login page
 * is what they were trying to reach.
 */
export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
