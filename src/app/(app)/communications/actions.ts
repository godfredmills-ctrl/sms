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

export type MemoState = { ok?: boolean; error?: string; message?: string };

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

  // Three address lines, one recipient table. CC differs from TO only in what
  // the header says about why you got it; BCC recipients receive the memo and
  // are never shown to anyone else — the classic use is a head teacher kept
  // quietly informed of a directive to a department.
  const toIds = formData.getAll("recipientIds").map(String).filter(Boolean);
  const ccIds = formData.getAll("ccIds").map(String).filter(Boolean);
  const bccIds = formData.getAll("bccIds").map(String).filter(Boolean);
  if (!toIds.length) return { error: "Choose at least one recipient." };

  // One row per person, strongest kind wins: someone on both TO and CC is TO.
  const kinds = new Map<string, string>();
  for (const userId of bccIds) kinds.set(userId, "BCC");
  for (const userId of ccIds) kinds.set(userId, "CC");
  for (const userId of toIds) kinds.set(userId, "TO");

  const attachmentIds = formData.getAll("attachmentIds").map(String).filter(Boolean);
  const requiresAck = formData.get("requiresAck") === "on";
  const issueNow = formData.get("mode") === "issue";
  const draftId = String(formData.get("draftId") ?? "");

  const priority = String(formData.get("priority") ?? "NORMAL");
  const shared = {
    subject,
    body,
    kind: String(formData.get("kind") ?? "INTERNAL"),
    priority,
    status: (issueNow ? "ISSUED" : "DRAFT") as never,
    issuedAt: issueNow ? new Date() : null,
    confidential: formData.get("confidential") === "on",
    requiresAck,
    fromDepartment: String(formData.get("fromDepartment") ?? "") || null,
  };

  const recipientRows = [...kinds.entries()].map(([userId, kind]) => ({ userId, kind }));
  const attachmentRows = attachmentIds.map((fileId) => ({ fileId }));

  let memo;
  if (draftId) {
    // Reopening a draft replaces its recipients and attachments wholesale:
    // the draft is whatever the form says now, not a merge with what it said
    // last time.
    const existing = await db.memo.findUnique({
      where: { id: draftId },
      select: { authorId: true, status: true, referenceNo: true },
    });
    if (!existing) return { error: "That draft no longer exists." };
    if (existing.authorId !== user.id) return { error: "Not your draft." };
    if (existing.status !== "DRAFT") {
      return { error: "This memo has already been issued and cannot be edited." };
    }

    memo = await db.memo.update({
      where: { id: draftId },
      data: {
        ...shared,
        recipients: { deleteMany: {}, create: recipientRows },
        attachments: { deleteMany: {}, create: attachmentRows },
      },
      select: { id: true, referenceNo: true },
    });
  } else {
    // Reference numbers are what staff quote in reply, so they are sequential
    // and human-readable rather than an opaque id. Derived from the count and
    // RETRIED on collision: discarding a draft shrinks the count, so the next
    // number can repeat one already issued, and without the retry that unique
    // constraint would refuse every new memo from then on.
    const year = new Date().getFullYear();
    const count = await db.memo.count();

    memo = null as never;
    for (let attempt = 0; attempt < 5 && !memo; attempt += 1) {
      const referenceNo = `MEMO/${year}/${String(count + 1 + attempt).padStart(4, "0")}`;
      try {
        memo = await db.memo.create({
          data: {
            ...shared,
            referenceNo,
            authorId: user.id,
            recipients: { create: recipientRows },
            attachments: { create: attachmentRows },
          },
          select: { id: true, referenceNo: true },
        });
      } catch (error) {
        if (!(error as Error).message.includes("referenceNo")) throw error;
      }
    }
    if (!memo) {
      return { error: "Could not allocate a memo number. Try again." };
    }
  }

  if (issueNow) {
    await notifyUsers([...kinds.keys()], {
      title: `Memo ${memo.referenceNo}: ${subject}`,
      body: requiresAck ? "This memo requires your acknowledgement." : subject,
      category: "MEMO",
      priority,
      url: "/communications/memos",
    }).catch(() => undefined);
  }

  revalidatePath("/communications/memos");
  return {
    ok: true,
    message: issueNow ? "Memo issued." : "Draft saved — find it under Drafts.",
  };
}

/**
 * Mailbox actions: archive, trash, restore. All per-recipient — they change
 * what this reader sees, and nothing about the memo or anyone else's copy.
 */
export async function setMemoMailboxAction(formData: FormData) {
  const user = await authorize("communication.memo.read");

  const memoId = String(formData.get("memoId") ?? "");
  const state = String(formData.get("state") ?? "");
  if (!memoId) return;

  const data =
    state === "archive"
      ? { archivedAt: new Date(), trashedAt: null }
      : state === "trash"
        ? { trashedAt: new Date(), archivedAt: null }
        : { archivedAt: null, trashedAt: null };

  await db.memoRecipient.updateMany({
    where: { memoId, userId: user.id },
    data,
  });

  revalidatePath("/communications/memos");
}

/** Discards a draft. Only drafts: an issued memo is a record, not an email. */
export async function deleteMemoDraftAction(formData: FormData) {
  const user = await authorize("communication.memo.create");

  const memoId = String(formData.get("memoId") ?? "");
  if (!memoId) return;

  // deleteMany with the full condition rather than a fetch-then-delete: the
  // where clause IS the authorisation.
  await db.memo.deleteMany({
    where: { id: memoId, authorId: user.id, status: "DRAFT" },
  });

  revalidatePath("/communications/memos");
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
