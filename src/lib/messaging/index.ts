import type { MessageChannel, PortalType, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";

import {
  countSegments,
  sendEmail,
  sendPush,
  sendSms,
  SMS_COST_PER_SEGMENT_MINOR,
  type PushPayload,
} from "./providers";

export * from "./providers";

/**
 * Communication dispatch.
 *
 * Every outbound message — announcement, fee reminder, results notice — is
 * modelled as a CommunicationJob that fans out to one CommunicationRecipient
 * per person per channel. That makes delivery auditable ("did Kwame's mother
 * actually get the SMS?") and gives the school a real cost figure per send.
 */

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------

/** Replaces `{{placeholders}}`; unknown placeholders resolve to an empty string. */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

/** Variables available to every template, so the editor can offer autocomplete. */
export const TEMPLATE_VARIABLES = [
  "student.firstName",
  "student.lastName",
  "student.fullName",
  "student.admissionNo",
  "student.class",
  "guardian.firstName",
  "guardian.fullName",
  "school.name",
  "school.phone",
  "invoice.number",
  "invoice.total",
  "invoice.balance",
  "invoice.dueDate",
  "term.name",
  "date.today",
] as const;

// -----------------------------------------------------------------------------
// Audience resolution
// -----------------------------------------------------------------------------

export type AudienceFilter = {
  portals?: PortalType[];
  roleKeys?: string[];
  classSectionIds?: string[];
  classLevelIds?: string[];
  studentIds?: string[];
  userIds?: string[];
  /** Guardians only, and only those flagged as bill payers. */
  billPayersOnly?: boolean;
  /** Restrict to students/guardians with an outstanding balance. */
  withOutstandingBalance?: boolean;
};

export type Recipient = {
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  /** Variables for per-recipient template rendering. */
  variables: Record<string, string | number | null | undefined>;
};

export async function resolveAudience(filter: AudienceFilter): Promise<Recipient[]> {
  const recipients = new Map<string, Recipient>();
  const school = await db.school.findFirst({ select: { name: true, phone: true } });
  const base = {
    "school.name": school?.name ?? "The School",
    "school.phone": school?.phone ?? "",
    "date.today": formatDate(new Date()),
  };

  const wantsStaff = filter.portals?.includes("STAFF") ?? false;
  const wantsStudents = filter.portals?.includes("STUDENT") ?? false;
  const wantsGuardians = filter.portals?.includes("GUARDIAN") ?? false;

  // --- Explicit users -------------------------------------------------------
  if (filter.userIds?.length) {
    const users = await db.user.findMany({
      where: { id: { in: filter.userIds }, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });
    for (const user of users) {
      recipients.set(user.id, {
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        variables: { ...base, "guardian.firstName": user.firstName },
      });
    }
  }

  // --- Staff ----------------------------------------------------------------
  if (wantsStaff) {
    const staff = await db.user.findMany({
      where: {
        portal: "STAFF",
        status: "ACTIVE",
        ...(filter.roleKeys?.length
          ? { roles: { some: { role: { key: { in: filter.roleKeys } } } } }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });
    for (const user of staff) {
      recipients.set(user.id, {
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phone,
        variables: { ...base, "guardian.firstName": user.firstName },
      });
    }
  }

  // --- Students and their guardians ----------------------------------------
  if (wantsStudents || wantsGuardians) {
    const students = await db.student.findMany({
      where: {
        status: "ENROLLED",
        ...(filter.studentIds?.length ? { id: { in: filter.studentIds } } : {}),
        ...(filter.classSectionIds?.length || filter.classLevelIds?.length
          ? {
              enrollments: {
                some: {
                  status: "ACTIVE",
                  classSection: {
                    ...(filter.classSectionIds?.length
                      ? { id: { in: filter.classSectionIds } }
                      : {}),
                    ...(filter.classLevelIds?.length
                      ? { classLevelId: { in: filter.classLevelIds } }
                      : {}),
                  },
                },
              },
            }
          : {}),
        ...(filter.withOutstandingBalance
          ? {
              invoices: {
                some: {
                  balanceMinor: { gt: 0 },
                  status: { in: ["ISSUED", "PART_PAID", "OVERDUE"] },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
        email: true,
        phone: true,
        user: { select: { id: true, email: true, phone: true } },
        enrollments: {
          where: { status: "ACTIVE" },
          take: 1,
          select: {
            classSection: {
              select: { name: true, classLevel: { select: { name: true } } },
            },
          },
        },
        invoices: {
          where: { balanceMinor: { gt: 0 } },
          select: { balanceMinor: true },
        },
        guardians: {
          where: filter.billPayersOnly ? { isBillPayer: true } : {},
          select: {
            guardian: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                user: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    for (const student of students) {
      const className = student.enrollments[0]
        ? `${student.enrollments[0].classSection.classLevel.name} ${student.enrollments[0].classSection.name}`
        : "";
      const balance = student.invoices.reduce(
        (sum, invoice) => sum + invoice.balanceMinor,
        0,
      );

      const studentVars = {
        ...base,
        "student.firstName": student.firstName,
        "student.lastName": student.lastName,
        "student.fullName": `${student.firstName} ${student.lastName}`,
        "student.admissionNo": student.admissionNo,
        "student.class": className,
        "invoice.balance": formatMoney(balance),
      };

      if (wantsStudents) {
        const key = student.user?.id ?? `student:${student.id}`;
        recipients.set(key, {
          userId: student.user?.id ?? null,
          name: `${student.firstName} ${student.lastName}`,
          email: student.user?.email ?? student.email,
          phone: student.user?.phone ?? student.phone,
          variables: studentVars,
        });
      }

      if (wantsGuardians) {
        for (const link of student.guardians) {
          const guardian = link.guardian;
          // Key by guardian so a parent with three children gets one message,
          // not three — unless the template needs per-child variables.
          const key = guardian.user?.id ?? `guardian:${guardian.id}`;
          recipients.set(key, {
            userId: guardian.user?.id ?? null,
            name: `${guardian.firstName} ${guardian.lastName}`,
            email: guardian.email,
            phone: guardian.phone,
            variables: {
              ...studentVars,
              "guardian.firstName": guardian.firstName,
              "guardian.fullName": `${guardian.firstName} ${guardian.lastName}`,
            },
          });
        }
      }
    }
  }

  return Array.from(recipients.values());
}

// -----------------------------------------------------------------------------
// Jobs
// -----------------------------------------------------------------------------

export type CreateJobInput = {
  title: string;
  channel: MessageChannel;
  subject?: string | null;
  body: string;
  audience: AudienceFilter;
  templateId?: string | null;
  announcementId?: string | null;
  scheduledAt?: Date | null;
  createdById?: string | null;
};

/**
 * Builds a job and its recipient rows. Returns the estimated cost so the
 * sender can be shown "this will send 412 SMS and cost about GH₵16.48"
 * before they commit.
 */
export async function createCommunicationJob(input: CreateJobInput) {
  const audience = await resolveAudience(input.audience);

  const rows = audience
    .map((recipient) => {
      const destination = destinationFor(input.channel, recipient);
      if (!destination) return null;

      const renderedBody = renderTemplate(input.body, recipient.variables);
      const { segments } =
        input.channel === "SMS" ? countSegments(renderedBody) : { segments: 1 };

      return {
        userId: recipient.userId,
        name: recipient.name,
        destination,
        channel: input.channel,
        renderedBody,
        segments,
        costMinor: input.channel === "SMS" ? segments * SMS_COST_PER_SEGMENT_MINOR : 0,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const estimatedCostMinor = rows.reduce((sum, row) => sum + row.costMinor, 0);

  return db.communicationJob.create({
    data: {
      title: input.title,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
      templateId: input.templateId ?? null,
      announcementId: input.announcementId ?? null,
      audienceFilter: input.audience as unknown as Prisma.InputJsonValue,
      totalCount: rows.length,
      estimatedCostMinor,
      scheduledAt: input.scheduledAt ?? null,
      createdById: input.createdById ?? null,
      status: input.scheduledAt && input.scheduledAt > new Date() ? "QUEUED" : "QUEUED",
      recipients: { create: rows },
    },
    include: { _count: { select: { recipients: true } } },
  });
}

function destinationFor(channel: MessageChannel, recipient: Recipient): string | null {
  switch (channel) {
    case "EMAIL":
      return recipient.email;
    case "SMS":
    case "WHATSAPP":
      return recipient.phone;
    case "PUSH":
    case "IN_APP":
      return recipient.userId;
    default:
      return null;
  }
}

/**
 * Delivers a queued job. Runs in batches so a 2,000-parent SMS blast does not
 * exhaust the provider's rate limit or the request timeout.
 */
export async function processCommunicationJob(
  jobId: string,
  options: { batchSize?: number } = {},
): Promise<{ sent: number; failed: number; costMinor: number }> {
  const batchSize = options.batchSize ?? 50;

  const job = await db.communicationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Communication job not found.");

  await db.communicationJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: job.startedAt ?? new Date() },
  });

  let sent = 0;
  let failed = 0;
  let costMinor = 0;

  for (;;) {
    const batch = await db.communicationRecipient.findMany({
      where: { jobId, status: { in: ["QUEUED", "SENDING"] } },
      take: batchSize,
    });
    if (!batch.length) break;

    await Promise.all(
      batch.map(async (recipient) => {
        const body = recipient.renderedBody ?? job.body;
        let outcome: Awaited<ReturnType<typeof sendSms>> = { ok: false };

        try {
          switch (job.channel) {
            case "EMAIL":
              outcome = await sendEmail({
                to: recipient.destination,
                subject: job.subject ?? job.title,
                html: toHtmlEmail(job.subject ?? job.title, body),
              });
              break;
            case "SMS":
              outcome = await sendSms({ to: recipient.destination, message: body });
              break;
            case "PUSH":
              outcome = await pushToUser(recipient.destination, {
                title: job.subject ?? job.title,
                body,
              });
              break;
            case "IN_APP":
              await db.notification.create({
                data: {
                  userId: recipient.destination,
                  title: job.subject ?? job.title,
                  body,
                  category: "ANNOUNCEMENT",
                },
              });
              outcome = { ok: true };
              break;
            default:
              outcome = { ok: false, error: `Unsupported channel ${job.channel}` };
          }
        } catch (error) {
          outcome = { ok: false, error: (error as Error).message };
        }

        if (outcome.ok) {
          sent += 1;
          costMinor += outcome.costMinor ?? recipient.costMinor;
        } else {
          failed += 1;
        }

        await db.communicationRecipient.update({
          where: { id: recipient.id },
          data: {
            status: outcome.ok ? "SENT" : "FAILED",
            providerMessageId: outcome.providerMessageId ?? null,
            segments: outcome.segments ?? recipient.segments,
            costMinor: outcome.costMinor ?? recipient.costMinor,
            attempts: { increment: 1 },
            sentAt: outcome.ok ? new Date() : null,
            failedAt: outcome.ok ? null : new Date(),
            error: outcome.error ?? null,
          },
        });
      }),
    );
  }

  await db.communicationJob.update({
    where: { id: jobId },
    data: {
      status: failed === 0 ? "COMPLETED" : sent === 0 ? "FAILED" : "PARTIAL",
      sentCount: { increment: sent },
      failedCount: { increment: failed },
      actualCostMinor: { increment: costMinor },
      completedAt: new Date(),
    },
  });

  return { sent, failed, costMinor };
}

function toHtmlEmail(subject: string, body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((chunk) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(chunk).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2933">
<table role="presentation" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 20px;font-size:20px;font-weight:600">${escapeHtml(subject)}</h1>
${paragraphs}
</td></tr></table></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// -----------------------------------------------------------------------------
// Direct notification helpers
// -----------------------------------------------------------------------------

/** Sends a push to every active subscription a user has registered. */
export async function pushToUser(userId: string, payload: PushPayload) {
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId, isActive: true },
  });

  if (!subscriptions.length) return { ok: false, error: "No push subscriptions." };

  let delivered = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      const result = await sendPush(subscription, payload);
      if (result.ok) {
        delivered += 1;
        await db.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastUsedAt: new Date(), failureCount: 0 },
        });
      } else if (result.expired) {
        await db.pushSubscription.update({
          where: { id: subscription.id },
          data: { isActive: false },
        });
      } else {
        await db.pushSubscription.update({
          where: { id: subscription.id },
          data: { failureCount: { increment: 1 } },
        });
      }
    }),
  );

  return { ok: delivered > 0 };
}

/**
 * The everyday helper: raise an in-app notification and, when the user has
 * granted permission, a push at the same time.
 */
export async function notifyUser(
  userId: string,
  input: {
    title: string;
    body?: string;
    category?: string;
    url?: string;
    priority?: string;
    push?: boolean;
    data?: Record<string, unknown>;
  },
) {
  await db.notification.create({
    data: {
      userId,
      title: input.title,
      body: input.body ?? null,
      category: input.category ?? "SYSTEM",
      url: input.url ?? null,
      priority: input.priority ?? "NORMAL",
      data: (input.data ?? undefined) as never,
    },
  });

  if (input.push !== false) {
    await pushToUser(userId, {
      title: input.title,
      body: input.body ?? "",
      url: input.url,
      data: input.data,
    }).catch(() => undefined);
  }
}

export async function notifyUsers(
  userIds: string[],
  input: Parameters<typeof notifyUser>[1],
) {
  await Promise.all(userIds.map((userId) => notifyUser(userId, input)));
}

// -----------------------------------------------------------------------------
// Automated fee reminders
// -----------------------------------------------------------------------------

/**
 * Evaluates every active reminder rule and sends what is due. Driven by
 * `/api/cron/reminders`; safe to run repeatedly because each rule records
 * what it has already sent per invoice.
 */
export async function runFeeReminders(): Promise<{
  rulesEvaluated: number;
  remindersSent: number;
  jobsCreated: string[];
}> {
  const rules = await db.reminderRule.findMany({
    where: { isActive: true },
    include: { template: true },
  });

  const hour = new Date().getHours();
  const jobsCreated: string[] = [];
  let remindersSent = 0;

  for (const rule of rules) {
    // Respect quiet hours — nobody wants a fee SMS at 04:00.
    if (hour < rule.sendAfterHour || hour >= rule.sendBeforeHour) continue;

    const now = new Date();
    let dueWindow: { gte?: Date; lte?: Date; lt?: Date } | undefined;

    switch (rule.trigger) {
      case "BEFORE_DUE": {
        const target = new Date(now.getTime() + rule.offsetDays * 86_400_000);
        dueWindow = { gte: startOfDay(target), lte: endOfDay(target) };
        break;
      }
      case "ON_DUE":
        dueWindow = { gte: startOfDay(now), lte: endOfDay(now) };
        break;
      case "AFTER_DUE": {
        const target = new Date(now.getTime() - rule.offsetDays * 86_400_000);
        dueWindow = { gte: startOfDay(target), lte: endOfDay(target) };
        break;
      }
      default:
        // BALANCE_OUTSTANDING ignores the due date entirely.
        dueWindow = undefined;
    }

    const invoices = await db.invoice.findMany({
      where: {
        status: { in: ["ISSUED", "PART_PAID", "OVERDUE"] },
        balanceMinor: { gt: rule.minBalanceMinor },
        ...(dueWindow ? { dueDate: dueWindow } : {}),
        remindersSent: { lt: rule.maxReminders },
        ...(rule.repeatEveryDays > 0
          ? {
              OR: [
                { lastReminderAt: null },
                {
                  lastReminderAt: {
                    lt: new Date(now.getTime() - rule.repeatEveryDays * 86_400_000),
                  },
                },
              ],
            }
          : { reminders: { none: { ruleId: rule.id } } }),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
          },
        },
        term: { select: { name: true } },
      },
      take: 500,
    });

    if (!invoices.length) continue;

    const body =
      rule.template?.smsBody ??
      rule.template?.body ??
      "Dear Parent/Guardian, the outstanding balance for {{student.fullName}} ({{student.class}}) is {{invoice.balance}}, due {{invoice.dueDate}}. Kindly settle at your earliest convenience. Thank you — {{school.name}}";

    for (const channel of rule.channels) {
      const job = await createCommunicationJob({
        title: `${rule.name} — ${formatDate(now)}`,
        channel,
        subject: "School Fees Reminder",
        body,
        templateId: rule.templateId,
        audience: {
          portals: rule.audience === "STUDENTS" ? ["STUDENT"] : ["GUARDIAN"],
          billPayersOnly: rule.audience === "BILL_PAYERS",
          studentIds: invoices.map((invoice) => invoice.student.id),
          withOutstandingBalance: true,
        },
      });

      jobsCreated.push(job.id);
      const outcome = await processCommunicationJob(job.id);
      remindersSent += outcome.sent;
    }

    await db.$transaction([
      db.feeReminder.createMany({
        data: invoices.map((invoice) => ({
          invoiceId: invoice.id,
          ruleId: rule.id,
          kind: rule.trigger,
          channels: rule.channels,
          balanceAtSendMinor: invoice.balanceMinor,
        })),
      }),
      db.invoice.updateMany({
        where: { id: { in: invoices.map((invoice) => invoice.id) } },
        data: { remindersSent: { increment: 1 }, lastReminderAt: new Date() },
      }),
      db.reminderRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date() },
      }),
    ]);
  }

  return { rulesEvaluated: rules.length, remindersSent, jobsCreated };
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/** Public VAPID key for the browser to subscribe with. */
export function getVapidPublicKey(): string {
  return env.push.publicKey;
}
