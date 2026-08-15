import nodemailer from "nodemailer";
import webpush from "web-push";

import { env } from "@/lib/env";
import { messagingSettings } from "@/lib/settings";
import { normalisePhone } from "@/lib/utils";

/**
 * Channel providers. Each one degrades to a logging "mock" implementation
 * when credentials are absent, so the whole communication pipeline — job
 * creation, per-recipient delivery records, cost estimates — can be exercised
 * end to end before a school signs up with an SMS aggregator.
 */

export type SendResult = {
  ok: boolean;
  providerMessageId?: string;
  /** SMS only: how many 160-character segments were billed. */
  segments?: number;
  costMinor?: number;
  error?: string;
};

// -----------------------------------------------------------------------------
// Email
// -----------------------------------------------------------------------------

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (env.email.provider !== "smtp" || !env.email.host) return null;
  transporter ??= nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: env.email.secure,
    auth: env.email.user ? { user: env.email.user, pass: env.email.password } : undefined,
  });
  return transporter;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}): Promise<SendResult> {
  const mailer = getTransporter();

  if (!mailer) {
    console.info(`[email:mock] to=${input.to} subject="${input.subject}"`);
    return { ok: true, providerMessageId: `mock-email-${Date.now()}` };
  }

  const { emailFrom, replyTo } = await messagingSettings();

  try {
    const info = await mailer.sendMail({
      from: emailFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html),
      replyTo: input.replyTo ?? (replyTo || undefined),
      attachments: input.attachments,
    });
    return { ok: true, providerMessageId: info.messageId };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// -----------------------------------------------------------------------------
// SMS
// -----------------------------------------------------------------------------

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/**
 * SMS is charged per segment and Ghanaian schools watch that cost closely, so
 * the segment count is computed before sending and stored on every recipient.
 */
export function countSegments(message: string): { segments: number; unicode: boolean } {
  const unicode = Array.from(message).some((char) => !GSM7.includes(char));
  const limit = unicode ? 70 : 160;
  const multipartLimit = unicode ? 67 : 153;
  const length = Array.from(message).length;

  if (length <= limit) return { segments: 1, unicode };
  return { segments: Math.ceil(length / multipartLimit), unicode };
}

/** Indicative cost used for pre-send estimates, in pesewas per segment. */
export const SMS_COST_PER_SEGMENT_MINOR = 4;

export async function sendSms(input: {
  to: string;
  message: string;
  senderId?: string;
}): Promise<SendResult> {
  const recipient = normalisePhone(input.to);
  if (!recipient) return { ok: false, error: "Invalid phone number." };

  const { segments } = countSegments(input.message);
  const costMinor = segments * SMS_COST_PER_SEGMENT_MINOR;
  // The school's own sender ID, set in Settings, overrides the deployment
  // default; the lookup is cached so a 900-recipient blast is still one query.
  const sender = input.senderId ?? (await messagingSettings()).senderId;

  try {
    switch (env.sms.provider) {
      case "arkesel":
        return await sendViaArkesel(recipient, input.message, sender, segments, costMinor);
      case "mnotify":
        return await sendViaMnotify(recipient, input.message, sender, segments, costMinor);
      case "hubtel":
        return await sendViaHubtel(recipient, input.message, sender, segments, costMinor);
      default:
        console.info(`[sms:mock] to=${recipient} segments=${segments} :: ${input.message}`);
        return {
          ok: true,
          providerMessageId: `mock-sms-${Date.now()}`,
          segments,
          costMinor,
        };
    }
  } catch (error) {
    return { ok: false, error: (error as Error).message, segments };
  }
}

async function sendViaArkesel(
  to: string,
  message: string,
  sender: string,
  segments: number,
  costMinor: number,
): Promise<SendResult> {
  if (!env.sms.arkeselKey) return { ok: false, error: "Arkesel API key missing." };

  const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
    method: "POST",
    headers: { "api-key": env.sms.arkeselKey, "Content-Type": "application/json" },
    body: JSON.stringify({ sender, message, recipients: [to.replace("+", "")] }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    status?: string;
    data?: Array<{ id?: string }>;
    message?: string;
  };

  if (!response.ok || body.status !== "success") {
    return { ok: false, error: body.message ?? `Arkesel returned ${response.status}` };
  }

  return { ok: true, providerMessageId: body.data?.[0]?.id, segments, costMinor };
}

async function sendViaMnotify(
  to: string,
  message: string,
  sender: string,
  segments: number,
  costMinor: number,
): Promise<SendResult> {
  if (!env.sms.mnotifyKey) return { ok: false, error: "mNotify API key missing." };

  const response = await fetch("https://api.mnotify.com/api/sms/quick", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: env.sms.mnotifyKey,
      recipient: [to.replace("+", "")],
      sender,
      message,
      is_schedule: false,
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    status?: string;
    summary?: { _id?: string };
    message?: string;
  };

  if (!response.ok || body.status !== "success") {
    return { ok: false, error: body.message ?? `mNotify returned ${response.status}` };
  }

  return { ok: true, providerMessageId: body.summary?._id, segments, costMinor };
}

async function sendViaHubtel(
  to: string,
  message: string,
  sender: string,
  segments: number,
  costMinor: number,
): Promise<SendResult> {
  const { hubtelClientId, hubtelClientSecret } = env.sms;
  if (!hubtelClientId || !hubtelClientSecret) {
    return { ok: false, error: "Hubtel SMS credentials missing." };
  }

  const url = new URL("https://smsc.hubtel.com/v1/messages/send");
  url.searchParams.set("clientid", hubtelClientId);
  url.searchParams.set("clientsecret", hubtelClientSecret);
  url.searchParams.set("from", sender);
  url.searchParams.set("to", to.replace("+", ""));
  url.searchParams.set("content", message);

  const response = await fetch(url, { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as {
    messageId?: string;
    status?: number;
  };

  if (!response.ok) {
    return { ok: false, error: `Hubtel returned ${response.status}` };
  }

  return { ok: true, providerMessageId: body.messageId, segments, costMinor };
}

// -----------------------------------------------------------------------------
// Web push
// -----------------------------------------------------------------------------

let vapidConfigured = false;

function configureVapid(): boolean {
  if (!env.push.enabled) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(env.push.subject, env.push.publicKey, env.push.privateKey);
    vapidConfigured = true;
  }
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
};

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function sendPush(
  subscription: PushSubscriptionInput,
  payload: PushPayload,
): Promise<SendResult & { expired?: boolean }> {
  if (!configureVapid()) {
    console.info(`[push:mock] ${payload.title} -> ${subscription.endpoint.slice(0, 40)}…`);
    return { ok: true, providerMessageId: `mock-push-${Date.now()}` };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url ?? "/",
        icon: payload.icon ?? "/icons/icon-192.png",
        badge: payload.badge ?? "/icons/badge-72.png",
        tag: payload.tag,
        data: payload.data ?? {},
      }),
      { TTL: 60 * 60 * 24 },
    );
    return { ok: true };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // 404/410 mean the browser dropped the subscription — stop retrying it.
    return {
      ok: false,
      expired: status === 404 || status === 410,
      error: (error as Error).message,
    };
  }
}
