"use server";

import { revalidatePath } from "next/cache";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/messaging";
import { parseAttachedDocuments } from "@/lib/person-documents";

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
  // An attachment on its own is a message: sending a file with no covering
  // note is ordinary, and refusing it would be pedantry.
  const attachmentIds = formData.getAll("attachmentIds").map(String).filter(Boolean);
  if (!conversationId || (!body && !attachmentIds.length)) {
    return { error: "Write something, or attach a file." };
  }

  try {
    await assertMember(conversationId, user.id);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const [, conversation] = await db.$transaction([
    db.directMessage.create({
      data: { conversationId, senderId: user.id, body, attachmentIds },
    }),
    db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
      select: {
        subject: true,
        members: { where: { isMuted: false }, select: { userId: true } },
      },
    }),
    // The sender has, by definition, read their own message — and the draft
    // they were writing has now been sent, so it stops being a draft.
    db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadAt: new Date(), draftBody: null, draftUpdatedAt: null },
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
  const ccIds = formData.getAll("ccIds").map(String).filter(Boolean);
  const bccIds = formData.getAll("bccIds").map(String).filter(Boolean);
  const attachmentIds = formData.getAll("attachmentIds").map(String).filter(Boolean);
  const body = text(formData, "body");
  const subject = text(formData, "subject");

  if (!recipientIds.length) return { error: "Choose who to write to." };
  if (!body && !attachmentIds.length) {
    return { error: "Write a message, or attach a file." };
  }

  // Someone listed twice is listed once, at the strongest role they were
  // given: being on the To line and also blind-copied means being on the To
  // line, and a blind copy that is really a visible one is a broken promise.
  const roleOf = new Map<string, "TO" | "CC" | "BCC">();
  for (const id of bccIds) roleOf.set(id, "BCC");
  for (const id of ccIds) roleOf.set(id, "CC");
  for (const id of recipientIds) roleOf.set(id, "TO");
  roleOf.delete(user.id);

  const members = [user.id, ...roleOf.keys()];

  // A one-to-one conversation is reused rather than duplicated, so a thread
  // with a parent stays a single history instead of fragmenting into stubs.
  let conversationId: string | null = null;

  // Only a plain two-party thread is reused. A message with copies is a new
  // conversation: folding it into an existing one-to-one would silently add
  // people to a history they were never part of.
  if (members.length === 2 && !ccIds.length && !bccIds.length) {
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
        members: {
          create: members.map((userId) => ({
            userId,
            role: userId === user.id ? "TO" : (roleOf.get(userId) ?? "TO"),
          })),
        },
      },
      select: { id: true },
    });
    conversationId = created.id;
  }

  await db.$transaction([
    db.directMessage.create({
      data: { conversationId, senderId: user.id, body, attachmentIds },
    }),
    db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    }),
    db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadAt: new Date(), draftBody: null, draftUpdatedAt: null },
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

/**
 * Keeps an unsent reply.
 *
 * Called as you type rather than on a button, because the value of a draft
 * is entirely in not having to remember to save it. Stored per member, so
 * two people replying to the same thread do not overwrite each other.
 */
export async function saveDraftAction(formData: FormData): Promise<MessageState> {
  let user;
  try {
    user = await authorize("communication.message");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const conversationId = text(formData, "conversationId");
  if (!conversationId) return { error: "No conversation given." };

  try {
    await assertMember(conversationId, user.id);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const body = text(formData, "body");

  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: {
      draftBody: body || null,
      draftUpdatedAt: body ? new Date() : null,
    },
  });

  revalidatePath("/messages");
  return { ok: true };
}

/**
 * Moves a thread between the viewer's own folders.
 *
 * Every one of these writes to the membership rather than the conversation:
 * a thread archived by a parent must stay in the head teacher's inbox, and
 * Conversation.isArchived — which is what existed — could not express that.
 *
 * Trash is a folder, not a delete. The messages stay, because a thread about
 * a child is a record the school may need, and because the person who
 * pressed the button is usually the one who wants it back.
 */
export async function setMailboxAction(formData: FormData) {
  const user = await authorize("communication.message");

  const conversationId = text(formData, "conversationId");
  const folder = text(formData, "folder");
  if (!conversationId) return;

  const now = new Date();
  const data =
    folder === "archive"
      ? { archivedAt: now, trashedAt: null }
      : folder === "trash"
        ? { trashedAt: now, archivedAt: null }
        : folder === "inbox"
          ? { archivedAt: null, trashedAt: null }
          : null;
  if (!data) return;

  // The where clause is the authorisation: you can only move your own copy.
  await db.conversationMember
    .update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data,
    })
    .catch(() => undefined);

  revalidatePath("/messages");
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
