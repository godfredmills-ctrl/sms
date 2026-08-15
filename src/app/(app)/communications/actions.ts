"use server";

import { revalidatePath } from "next/cache";
import type { MessageChannel, PortalType } from "@prisma/client";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createCommunicationJob,
  countSegments,
  notifyUsers,
  processCommunicationJob,
  resolveAudience,
  SMS_COST_PER_SEGMENT_MINOR,
  type AudienceFilter,
} from "@/lib/messaging";

// -----------------------------------------------------------------------------
// Audience preview
// -----------------------------------------------------------------------------

export type AudiencePreview = {
  recipients: number;
  reachable: number;
  segments: number;
  costMinor: number;
  sample: string[];
};

/**
 * Counts who a message would actually reach before it is sent.
 *
 * SMS costs real money per segment and a mis-targeted blast cannot be
 * recalled, so the compose screen shows the true reachable count — people
 * with no phone number are excluded rather than silently failing later.
 */
export async function previewAudienceAction(
  filter: AudienceFilter,
  channel: MessageChannel,
  body: string,
): Promise<AudiencePreview> {
  await authorize([
    "communication.sms.send",
    "communication.email.send",
    "communication.push.send",
  ]);

  const audience = await resolveAudience(filter);

  const reachableList = audience.filter((recipient) => {
    switch (channel) {
      case "EMAIL":
        return Boolean(recipient.email);
      case "SMS":
      case "WHATSAPP":
        return Boolean(recipient.phone);
      default:
        return Boolean(recipient.userId);
    }
  });

  const segments =
    channel === "SMS" ? countSegments(body || " ").segments * reachableList.length : 0;

  return {
    recipients: audience.length,
    reachable: reachableList.length,
    segments,
    costMinor: segments * SMS_COST_PER_SEGMENT_MINOR,
    sample: reachableList.slice(0, 5).map((recipient) => recipient.name),
  };
}

// -----------------------------------------------------------------------------
// Bulk send
// -----------------------------------------------------------------------------

export type SendState = {
  ok?: boolean;
  error?: string;
  sent?: number;
  failed?: number;
  costMinor?: number;
};

function audienceFromForm(formData: FormData): AudienceFilter {
  const portals = formData.getAll("portals").map(String) as PortalType[];
  const classIds = String(formData.get("classSectionIds") ?? "")
    .split(",")
    .filter(Boolean);
  const studentIds = String(formData.get("studentIds") ?? "")
    .split(",")
    .filter(Boolean);

  return {
    portals: portals.length ? portals : ["GUARDIAN"],
    classSectionIds: classIds.length ? classIds : undefined,
    studentIds: studentIds.length ? studentIds : undefined,
    billPayersOnly: formData.get("billPayersOnly") === "on",
    withOutstandingBalance: formData.get("withBalance") === "on",
  };
}

export async function sendMessageAction(
  _previous: SendState,
  formData: FormData,
): Promise<SendState> {
  const channel = String(formData.get("channel") ?? "SMS") as MessageChannel;

  const permission =
    channel === "EMAIL"
      ? "communication.email.send"
      : channel === "SMS"
        ? "communication.sms.send"
        : "communication.push.send";

  let user;
  try {
    user = await authorize(permission);
  } catch (error) {
    return { error: (error as Error).message };
  }

  const title = String(formData.get("title") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!title) return { error: "Give this send a name so it can be found later." };
  if (!body) return { error: "The message body is empty." };

  const audience = audienceFromForm(formData);

  try {
    const job = await createCommunicationJob({
      title,
      channel,
      subject: subject || title,
      body,
      audience,
      createdById: user.id,
    });

    if (job.totalCount === 0) {
      return {
        error:
          "Nobody in that audience can be reached on this channel. Check the targeting, or that contacts have a phone number or email on file.",
      };
    }

    const outcome = await processCommunicationJob(job.id);

    await db.auditLog.create({
      data: {
        userId: user.id,
        actorLabel: user.fullName,
        action: "communication.send",
        entity: "CommunicationJob",
        entityId: job.id,
        summary: `${channel}: ${outcome.sent} sent, ${outcome.failed} failed`,
      },
    });

    revalidatePath("/communications/compose");
    return {
      ok: true,
      sent: outcome.sent,
      failed: outcome.failed,
      costMinor: outcome.costMinor,
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

// -----------------------------------------------------------------------------
// Announcements
// -----------------------------------------------------------------------------

export type AnnouncementState = { ok?: boolean; error?: string };

export async function saveAnnouncementAction(
  _previous: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  let user;
  try {
    user = await authorize("communication.announcement.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { error: "A title and a message are both required." };

  const audiences = formData.getAll("audiences").map(String) as PortalType[];
  if (!audiences.length) return { error: "Choose at least one audience." };

  const publishNow = formData.get("publishNow") === "on";
  const channels = formData.getAll("channels").map(String) as MessageChannel[];

  const announcement = await db.announcement.create({
    data: {
      title,
      summary: String(formData.get("summary") ?? "") || null,
      body,
      category: String(formData.get("category") ?? "GENERAL"),
      priority: String(formData.get("priority") ?? "NORMAL"),
      status: publishNow ? "PUBLISHED" : "DRAFT",
      publishedAt: publishNow ? new Date() : null,
      audiences,
      channels: channels.length ? channels : ["IN_APP"],
      isPinned: formData.get("isPinned") === "on",
      authorId: user.id,
    },
  });

  // In-app notification is immediate; SMS/email go through a job so delivery
  // is tracked per person and the cost is recorded.
  if (publishNow) {
    const recipients = await resolveAudience({ portals: audiences });
    const userIds = recipients
      .map((recipient) => recipient.userId)
      .filter((id): id is string => Boolean(id));

    if (userIds.length) {
      await notifyUsers(userIds, {
        title: announcement.title,
        body: announcement.summary ?? announcement.title,
        category: "ANNOUNCEMENT",
        url: "/communications/announcements",
        push: channels.includes("PUSH"),
      }).catch(() => undefined);
    }

    for (const channel of channels.filter((entry) =>
      ["SMS", "EMAIL"].includes(entry),
    )) {
      const job = await createCommunicationJob({
        title: `Announcement: ${title}`,
        channel,
        subject: title,
        body,
        announcementId: announcement.id,
        audience: { portals: audiences },
        createdById: user.id,
      });
      await processCommunicationJob(job.id).catch(() => undefined);
    }
  }

  revalidatePath("/communications/announcements");
  return { ok: true };
}

export async function publishAnnouncementAction(id: string) {
  const user = await authorize("communication.announcement.manage");

  const announcement = await db.announcement.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
    select: { title: true, summary: true, audiences: true },
  });

  const recipients = await resolveAudience({ portals: announcement.audiences });
  const userIds = recipients
    .map((recipient) => recipient.userId)
    .filter((entry): entry is string => Boolean(entry));

  if (userIds.length) {
    await notifyUsers(userIds, {
      title: announcement.title,
      body: announcement.summary ?? announcement.title,
      category: "ANNOUNCEMENT",
      url: "/communications/announcements",
    }).catch(() => undefined);
  }

  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "communication.announcement.publish",
      entity: "Announcement",
      entityId: id,
      summary: `Published to ${userIds.length} people`,
    },
  });

  revalidatePath("/communications/announcements");
}

export async function archiveAnnouncementAction(id: string) {
  await authorize("communication.announcement.manage");
  await db.announcement.update({ where: { id }, data: { status: "ARCHIVED" } });
  revalidatePath("/communications/announcements");
}

// -----------------------------------------------------------------------------
// Memos
// -----------------------------------------------------------------------------

export type MemoState = { ok?: boolean; error?: string };

export async function createMemoAction(
  _previous: MemoState,
  formData: FormData,
): Promise<MemoState> {
  let user;
  try {
    user = await authorize("communication.memo.create");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject || !body) return { error: "A subject and a body are both required." };

  const recipientIds = formData.getAll("recipientIds").map(String).filter(Boolean);
  if (!recipientIds.length) return { error: "Choose at least one recipient." };

  const requiresAck = formData.get("requiresAck") === "on";
  const issueNow = formData.get("issueNow") === "on";

  // Reference numbers are what staff quote in reply, so they are sequential
  // and human-readable rather than an opaque id.
  const year = new Date().getFullYear();
  const count = await db.memo.count();
  const referenceNo = `MEMO/${year}/${String(count + 1).padStart(4, "0")}`;

  const memo = await db.memo.create({
    data: {
      referenceNo,
      subject,
      body,
      kind: String(formData.get("kind") ?? "INTERNAL"),
      priority: String(formData.get("priority") ?? "NORMAL"),
      status: issueNow ? "ISSUED" : "DRAFT",
      issuedAt: issueNow ? new Date() : null,
      confidential: formData.get("confidential") === "on",
      requiresAck,
      fromDepartment: String(formData.get("fromDepartment") ?? "") || null,
      authorId: user.id,
      recipients: {
        create: recipientIds.map((userId) => ({ userId, kind: "TO" })),
      },
    },
  });

  if (issueNow) {
    await notifyUsers(recipientIds, {
      title: `Memo ${referenceNo}: ${subject}`,
      body: requiresAck ? "This memo requires your acknowledgement." : subject,
      category: "MEMO",
      priority: String(formData.get("priority") ?? "NORMAL"),
      url: "/communications/memos",
    }).catch(() => undefined);
  }

  revalidatePath("/communications/memos");
  void memo;
  return { ok: true };
}

/** Records that a recipient has read and accepted a memo. */
export async function acknowledgeMemoAction(memoId: string) {
  const user = await authorize("communication.memo.read");

  await db.memoRecipient.updateMany({
    where: { memoId, userId: user.id },
    data: { acknowledgedAt: new Date(), readAt: new Date() },
  });

  revalidatePath("/communications/memos");
}
