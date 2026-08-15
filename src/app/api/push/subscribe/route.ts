import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Registers this browser's push subscription against the signed-in user. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  } | null;

  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  // The endpoint is unique per browser install, so an upsert both registers a
  // new device and re-points an existing one at the current user.
  await db.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: {
      userId: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: body.userAgent?.slice(0, 300) ?? null,
    },
    update: {
      userId: user.id,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      isActive: true,
      failureCount: 0,
      lastUsedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { endpoint } = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
  };
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint." }, { status: 400 });

  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return NextResponse.json({ ok: true });
}
