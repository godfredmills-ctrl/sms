import { NextResponse } from "next/server";

import { destroySession, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export async function POST() {
  const user = await getCurrentUser();

  if (user) {
    await db.auditLog
      .create({ data: { userId: user.id, action: "auth.logout", summary: "Signed out" } })
      .catch(() => undefined);
  }

  await destroySession();
  return NextResponse.redirect(new URL("/login", env.appUrl), { status: 303 });
}
