import { NextResponse } from "next/server";

import { getVapidPublicKey } from "@/lib/messaging";

/** The browser needs the VAPID public key to create a push subscription. */
export async function GET() {
  return NextResponse.json({ publicKey: await getVapidPublicKey() });
}
