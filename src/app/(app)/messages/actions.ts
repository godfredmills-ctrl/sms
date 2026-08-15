"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/messaging";

export type MessageState = { ok?: boolean; error?: string; conversationId?: string };

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * Confirms the signed-in user is a member of a conversation.
 *
 * Every read and write goes through this. Without it, a conversation id is a
 * URL parameter that reveals someone else's messages about their child.
 */
async function assertMember(conversationId: string, userId: string) {
  const member = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { userId: true },
  });
  if (!member) throw new Error("You are not part of that conversation.");
}

export async function sendMessageAction(
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  let user;
  try {
    user = await authorize("communication.message");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const conversationId = text(formData, "conversationId");
  const body = text(formData, "body");
  if (!conversationId || !body) return { error: "Write something first." };

  try {
    await assertMember(conversationId, user.id);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const [, conversation] = await db.$transaction([
    db.directMessage.create({
      data: { conversationId, senderId: user.id, body },
    }),
    db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
      select: {
        subject: true,
        members: { where: { isMuted: false }, select: { userId: true } },
      },
    }),
    // The sender has, by definition, read their own message.
    db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadAt: new Date() },
    }),
  ]);

  const recipients = conversation.members
    .map((member) => member.userId)
    .filter((id) => id !== user.id);

  if (recipients.length) {
    await notifyUsers(recipients, {
      title: `Message from ${user.fullName}`,
      body: body.slice(0, 140),
      category: "SYSTEM",
      url: `/messages?c=${conversationId}`,
    }).catch(() => undefined);
  }

  revalidatePath("/messages");
  return { ok: true, conversationId };
}

export async function startConversationAction(
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  let user;
  try {
    user = await authorize("communication.message");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const recipientIds = formData.getAll("recipientIds").map(String).filter(Boolean);
  const body = text(formData, "body");
  const subject = text(formData, "subject");

  if (!recipientIds.length) return { error: "Choose who to write to." };
  if (!body) return { error: "Write a message." };

  const members = [...new Set([user.id, ...recipientIds])];

  // A one-to-one conversation is reused rather than duplicated, so a thread
  // with a parent stays a single history instead of fragmenting into stubs.
  let conversationId: string | null = null;

  if (members.length === 2) {
    const existing = await db.conversation.findFirst({
      where: {
        kind: "DIRECT",
        AND: members.map((id) => ({ members: { some: { userId: id } } })),
      },
      select: { id: true, members: { select: { userId: true } } },
    });
    if (existing && existing.members.length === 2) conversationId = existing.id;
  }

  if (!conversationId) {
    const created = await db.conversation.create({
      data: {
        subject: subject || null,
        kind: members.length > 2 ? "GROUP" : "DIRECT",
        studentId: text(formData, "studentId") || null,
        members: { create: members.map((userId) => ({ userId })) },
      },
      select: { id: true },
    });
    conversationId = created.id;
  }

  await db.$transaction([
    db.directMessage.create({
      data: { conversationId, senderId: user.id, body },
    }),
    db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    }),
    db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadAt: new Date() },
    }),
  ]);

  await notifyUsers(
    members.filter((id) => id !== user.id),
    {
      title: `Message from ${user.fullName}`,
      body: body.slice(0, 140),
      category: "SYSTEM",
      url: `/messages?c=${conversationId}`,
    },
  ).catch(() => undefined);

  revalidatePath("/messages");
  return { ok: true, conversationId };
}

export async function markConversationReadAction(formData: FormData) {
  const user = await authorize("communication.message");

  const conversationId = text(formData, "conversationId");
  if (!conversationId) return;

  await db.conversationMember
    .update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadAt: new Date() },
    })
    .catch(() => undefined);

  revalidatePath("/messages");
}

export async function toggleMuteAction(formData: FormData) {
  const user = await authorize("communication.message");

  const conversationId = text(formData, "conversationId");
  if (!conversationId) return;

  const member = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    select: { isMuted: true },
  });
  if (!member) return;

  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { isMuted: !member.isMuted },
  });

  revalidatePath("/messages");
}
