"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function markNotificationReadAction(formData: FormData) {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  const url = String(formData.get("url") ?? "");
  if (!id) return;

  // Scoped by userId as well as id: a notification id from someone else's
  // account should not be markable, however it was obtained.
  await db.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");

  // Only same-origin paths are followed. An open redirect from a stored value
  // is a phishing primitive, and notification URLs are written by many parts
  // of the system.
  if (url.startsWith("/") && !url.startsWith("//")) redirect(url);
}

export async function markAllReadAction() {
  const user = await requireUser();

  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");
}
