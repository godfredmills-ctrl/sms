import "server-only";

import { createECDH } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";

import { messagingSettings } from "@/lib/settings";
import { checkStorage, checkStorageWritable } from "@/lib/storage";
import { normalisePhone } from "@/lib/utils";

import { integrationConfig } from "./config";
import type { IntegrationId } from "./catalogue";

/**
 * Does this integration actually work?
 *
 * Every check here talks to the real provider. The page this feeds used to
 * infer "configured" from whether the variables happened to be non-empty,
 * which answers a different and much weaker question: a revoked Paystack key,
 * an SMTP password changed last term, a bucket token issued read-only and an
 * Anthropic model that no longer exists all look perfectly configured from the
 * environment alone.
 *
 * Two rules the checks hold to:
 *
 * 1. **Never claim more than was proved.** Where a provider has no endpoint
 *    that can distinguish "your credentials are wrong" from "this URL moved",
 *    the check says so and offers a test send instead of guessing.
 * 2. **Never spend the school's money without being asked.** Balance lookups
 *    are free; sending an SMS is not. A live send happens only when someone
 *    types a number into the box.
 */

export type CheckResult = {
  ok: boolean;
  detail: string;
  /** True when nothing was actually contacted — a mock, or an unset provider. */
  inconclusive?: boolean;
};

const TIMEOUT_MS = 12_000;

/**
 * A provider that never answers must not hold the settings page open until the
 * platform's own request timeout kills it, which reads to the user as the page
 * being broken rather than the provider being unreachable.
 */
async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  onTimeout: () => T,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await work(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) return onTimeout();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function failure(error: unknown): string {
  const message = (error as Error)?.message ?? String(error);
  // Node wraps connection faults in a generic message and hides the useful
  // part in `cause` — "fetch failed" is not something anyone can act on.
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  if (cause?.code === "ENOTFOUND") return `Host not found (${cause.code}). Check the address.`;
  if (cause?.code === "ECONNREFUSED") return "The host refused the connection.";
  if (cause?.message) return cause.message;
  return message;
}

// -----------------------------------------------------------------------------
// Payments
// -----------------------------------------------------------------------------

async function checkPayments(): Promise<CheckResult> {
  const { payments } = await integrationConfig();

  if (payments.provider === "mock") {
    return {
      ok: true,
      inconclusive: true,
      detail:
        "The test gateway is in use. Fees are recorded and receipts issued, but no money moves.",
    };
  }

  if (payments.provider === "paystack") {
    if (!payments.paystackSecret) return { ok: false, detail: "No secret key is set." };

    return withTimeout(
      async (signal) => {
        const response = await fetch("https://api.paystack.co/balance", {
          headers: { Authorization: `Bearer ${payments.paystackSecret}` },
          cache: "no-store",
          signal,
        });
        const body = (await response.json().catch(() => ({}))) as {
          status?: boolean;
          message?: string;
          data?: Array<{ currency?: string; balance?: number }>;
        };

        if (response.status === 401) {
          return { ok: false, detail: "Paystack rejected the secret key." };
        }
        if (!response.ok || body.status === false) {
          return { ok: false, detail: body.message ?? `Paystack returned ${response.status}.` };
        }

        const live = payments.paystackSecret.startsWith("sk_live_");
        const balances = (body.data ?? [])
          .map((entry) => `${entry.currency ?? "?"} ${((entry.balance ?? 0) / 100).toFixed(2)}`)
          .join(", ");

        return {
          ok: true,
          detail: live
            ? `Live key accepted. Settlement balance: ${balances || "none reported"}.`
            : `Test key accepted: no real money will move. Balance: ${balances || "none reported"}.`,
        };
      },
      () => ({ ok: false, detail: "Paystack did not answer within 12 seconds." }),
    ).catch((error) => ({ ok: false, detail: failure(error) }));
  }

  if (payments.provider === "hubtel") {
    const missing = [
      !payments.hubtelClientId && "client ID",
      !payments.hubtelClientSecret && "client secret",
      !payments.hubtelMerchant && "merchant account number",
    ].filter(Boolean);

    if (missing.length) {
      return { ok: false, detail: `Missing: ${missing.join(", ")}.` };
    }

    const auth = Buffer.from(
      `${payments.hubtelClientId}:${payments.hubtelClientSecret}`,
    ).toString("base64");

    return withTimeout(
      async (signal) => {
        // Asking after a reference that cannot exist. Hubtel answers 401 when
        // the credentials are wrong and 4xx-not-401 when they are right and
        // the reference simply is not there, which is the distinction worth
        // reporting; anything else is left as "could not tell".
        const response = await fetch(
          `https://api-txnstatus.hubtel.com/transactions/${encodeURIComponent(payments.hubtelMerchant)}/status?clientReference=__configuration_probe__`,
          { headers: { Authorization: `Basic ${auth}` }, cache: "no-store", signal },
        );

        if (response.status === 401 || response.status === 403) {
          return { ok: false, detail: "Hubtel rejected the client ID and secret." };
        }
        if (response.status >= 500) {
          return {
            ok: false,
            inconclusive: true,
            detail: `Hubtel returned ${response.status}, which is a fault at their end rather than a wrong credential.`,
          };
        }
        return {
          ok: true,
          detail: `Hubtel accepted the credentials for merchant account ${payments.hubtelMerchant}.`,
        };
      },
      () => ({ ok: false, detail: "Hubtel did not answer within 12 seconds." }),
    ).catch((error) => ({ ok: false, detail: failure(error) }));
  }

  return {
    ok: false,
    detail: `"${payments.provider}" is not a payment provider this system knows. Nothing will be charged until it is corrected.`,
  };
}

// -----------------------------------------------------------------------------
// SMS
// -----------------------------------------------------------------------------

async function checkSms(): Promise<CheckResult> {
  const { sms } = await integrationConfig();

  if (sms.provider === "mock") {
    return {
      ok: true,
      inconclusive: true,
      detail:
        "Messages are written to the server log, never delivered. Costs are still estimated so a broadcast can be rehearsed.",
    };
  }

  if (sms.provider === "arkesel") {
    if (!sms.arkeselKey) return { ok: false, detail: "No API key is set." };

    return withTimeout(
      async (signal) => {
        const response = await fetch(
          "https://sms.arkesel.com/api/v2/clients/balance-details",
          { headers: { "api-key": sms.arkeselKey }, cache: "no-store", signal },
        );
        if (response.status === 401 || response.status === 403) {
          return { ok: false, detail: "Arkesel rejected the API key." };
        }
        if (!response.ok) {
          return { ok: false, detail: `Arkesel returned ${response.status}.` };
        }
        const body = (await response.json().catch(() => ({}))) as {
          data?: { sms_balance?: string | number; main_balance?: string | number };
        };
        const balance =
          body.data?.sms_balance ?? body.data?.main_balance ?? "not reported";
        return {
          ok: true,
          detail: `Arkesel accepted the key. Balance: ${balance}. This does not prove the sender ID is registered: send a test message below to confirm that.`,
        };
      },
      () => ({ ok: false, detail: "Arkesel did not answer within 12 seconds." }),
    ).catch((error) => ({ ok: false, detail: failure(error) }));
  }

  if (sms.provider === "mnotify") {
    if (!sms.mnotifyKey) return { ok: false, detail: "No API key is set." };

    return withTimeout(
      async (signal) => {
        const response = await fetch(
          `https://api.mnotify.com/api/balance/sms?key=${encodeURIComponent(sms.mnotifyKey)}`,
          { cache: "no-store", signal },
        );
        if (response.status === 401 || response.status === 403) {
          return { ok: false, detail: "mNotify rejected the API key." };
        }
        if (!response.ok) {
          return { ok: false, detail: `mNotify returned ${response.status}.` };
        }
        const body = (await response.json().catch(() => ({}))) as {
          status?: string;
          balance?: string | number;
        };
        if (body.status && body.status !== "success") {
          return { ok: false, detail: "mNotify rejected the API key." };
        }
        return {
          ok: true,
          detail: `mNotify accepted the key. Balance: ${body.balance ?? "not reported"}. This does not prove the sender ID is registered: send a test message below to confirm that.`,
        };
      },
      () => ({ ok: false, detail: "mNotify did not answer within 12 seconds." }),
    ).catch((error) => ({ ok: false, detail: failure(error) }));
  }

  if (sms.provider === "hubtel") {
    const missing = [
      !sms.hubtelClientId && "SMS client ID",
      !sms.hubtelClientSecret && "SMS client secret",
    ].filter(Boolean);
    if (missing.length) return { ok: false, detail: `Missing: ${missing.join(", ")}.` };

    // Hubtel's SMS API has no free endpoint that separates a wrong credential
    // from a moved URL, and guessing would mean reporting "your key is wrong"
    // to a school whose key is fine. Say what is true.
    return {
      ok: true,
      inconclusive: true,
      detail:
        "Both credentials are present. Hubtel offers no free way to verify them without sending, so use the test message below: it is the only check that proves anything.",
    };
  }

  return {
    ok: false,
    detail: `"${sms.provider}" is not an SMS provider this system knows. Nothing will be sent until it is corrected.`,
  };
}

/**
 * Sends one real SMS, to a number somebody typed.
 *
 * The only check that proves the whole chain — key, balance, route, and the
 * sender ID being registered, which is the step that most often fails and the
 * one no balance lookup can see.
 */
export async function sendTestSms(
  to: string,
): Promise<CheckResult> {
  const recipient = normalisePhone(to);
  if (!recipient) return { ok: false, detail: `"${to}" is not a phone number.` };

  const { sendSms } = await import("@/lib/messaging/providers");
  const { senderId } = await messagingSettings();
  const result = await sendSms({
    to: recipient,
    message: `Test message from the school management system. If you received this, SMS is working. Sender ID: ${senderId}.`,
  });

  if (!result.ok) return { ok: false, detail: result.error ?? "The provider refused it." };

  return {
    ok: true,
    detail: `Accepted for delivery to ${recipient} as "${senderId}". If nothing arrives within a few minutes, the sender ID is not registered with your provider: that is the usual cause and the provider must register it for you.`,
  };
}

// -----------------------------------------------------------------------------
// Email
// -----------------------------------------------------------------------------

async function checkEmail(): Promise<CheckResult> {
  const { email } = await integrationConfig();

  if (email.provider === "mock") {
    return {
      ok: true,
      inconclusive: true,
      detail: "Email is written to the server log, never sent.",
    };
  }

  if (email.provider !== "smtp") {
    return {
      ok: false,
      detail: `"${email.provider}" is not an email provider this system knows. Choose SMTP or leave it logged.`,
    };
  }

  if (!email.host) return { ok: false, detail: "No SMTP host is set." };

  try {
    const transport = nodemailer.createTransport({
      host: email.host,
      port: email.port,
      secure: email.secure,
      auth: email.user ? { user: email.user, pass: email.password } : undefined,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
    });

    // A full handshake including AUTH — this fails on a wrong password, which
    // is the whole point of running it.
    await transport.verify();

    return {
      ok: true,
      detail: email.user
        ? `${email.host}:${email.port} accepted the connection and signed in as ${email.user}.`
        : `${email.host}:${email.port} accepted the connection. No username is set, so the host must be relaying without authentication.`,
    };
  } catch (error) {
    const message = failure(error);
    // The two mistakes that account for most of these, named rather than left
    // as a raw SMTP code.
    if (/wrong version number|SSL routines/i.test(message)) {
      return {
        ok: false,
        detail: `${message}: this usually means the TLS setting does not match the port. Port 587 wants the TLS box unticked; port 465 wants it ticked.`,
      };
    }
    if (/invalid login|535|authentication failed/i.test(message)) {
      return {
        ok: false,
        detail: `${message}: for Google Workspace or Microsoft 365 this must be an app password, not the account's own password.`,
      };
    }
    return { ok: false, detail: message };
  }
}

/** Sends one real email, to an address somebody typed. */
export async function sendTestEmail(to: string): Promise<CheckResult> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) {
    return { ok: false, detail: `"${to}" is not an email address.` };
  }

  const { sendEmail } = await import("@/lib/messaging/providers");
  const { emailFrom } = await messagingSettings();
  const result = await sendEmail({
    to: to.trim(),
    subject: "Test message from the school management system",
    html: `<p>If you are reading this, email is working.</p><p>Sent as <strong>${emailFrom}</strong>.</p>`,
  });

  if (!result.ok) return { ok: false, detail: result.error ?? "The host refused it." };
  return {
    ok: true,
    detail: `Sent to ${to.trim()} as "${emailFrom}". If it does not arrive, check the spam folder: a from-address the host is not authorised to send as is usually filed there rather than rejected.`,
  };
}

// -----------------------------------------------------------------------------
// Push
// -----------------------------------------------------------------------------

async function checkPush(): Promise<CheckResult> {
  const { push } = await integrationConfig();

  if (!push.publicKey && !push.privateKey) {
    return {
      ok: false,
      detail:
        "No key pair is set. Generate one below: it takes a moment and costs nothing.",
    };
  }
  if (!push.publicKey) return { ok: false, detail: "The public key is missing." };
  if (!push.privateKey) return { ok: false, detail: "The private key is missing." };

  // The pair is checked properly rather than by length: a public key from one
  // generation and a private key from another are both well-formed, both look
  // configured, and every notification is signed with a key the browser will
  // not accept. Deriving the public point from the private scalar is the only
  // thing that catches it.
  try {
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(Buffer.from(push.privateKey, "base64url"));
    const derived = curve.getPublicKey();
    const declared = Buffer.from(push.publicKey, "base64url");

    if (!derived.equals(declared)) {
      return {
        ok: false,
        detail:
          "The public and private keys are both valid but are not a pair: they come from different generations. Every notification would be signed with a key the browser rejects. Generate a fresh pair below.",
      };
    }
  } catch {
    return {
      ok: false,
      detail:
        "The keys are not a valid VAPID pair. They must be the base64url values from a single generation.",
    };
  }

  if (!/^(mailto:|https:)/.test(push.subject)) {
    return {
      ok: false,
      detail: `The contact must start with mailto: or https:: "${push.subject}" will be rejected by some push services.`,
    };
  }

  return {
    ok: true,
    detail: `The key pair is valid and matched. Notifications will be signed as ${push.subject}.`,
  };
}

// -----------------------------------------------------------------------------
// AI
// -----------------------------------------------------------------------------

async function checkAi(): Promise<CheckResult> {
  const { ai } = await integrationConfig();

  if (!ai.apiKey) {
    return { ok: false, detail: "No API key is set. Every AI feature is switched off." };
  }
  if (!ai.enabled) {
    return {
      ok: true,
      inconclusive: true,
      detail: "A key is set but AI features are switched off here.",
    };
  }

  try {
    const client = new Anthropic({ apiKey: ai.apiKey, maxRetries: 1 });
    // Retrieving the configured model answers both questions at once: a 401
    // means the key is wrong, a 404 means the key is fine and the model name
    // is not — which is worth telling apart, because the second one shows up
    // as a report card with no remark on it.
    const model = await client.models.retrieve(ai.model);
    return { ok: true, detail: `Key accepted. "${model.display_name ?? model.id}" is available.` };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) return { ok: false, detail: "Anthropic rejected the API key." };
    if (status === 404) {
      return {
        ok: false,
        detail: `The key works, but there is no model called "${ai.model}". Clear the model field to use the default.`,
      };
    }
    if (status === 429) {
      return {
        ok: false,
        inconclusive: true,
        detail: "The key works but the account is rate limited at the moment.",
      };
    }
    return { ok: false, detail: failure(error) };
  }
}

// -----------------------------------------------------------------------------
// Storage
// -----------------------------------------------------------------------------

async function checkStorageIntegration(): Promise<CheckResult> {
  const reachable = await checkStorage();
  if (!reachable.ok) return { ok: false, detail: reachable.detail };
  const writable = await checkStorageWritable();
  return { ok: writable.ok, detail: writable.detail };
}

// -----------------------------------------------------------------------------

export async function checkIntegration(id: IntegrationId): Promise<CheckResult> {
  switch (id) {
    case "payments":
      return checkPayments();
    case "sms":
      return checkSms();
    case "email":
      return checkEmail();
    case "push":
      return checkPush();
    case "ai":
      return checkAi();
    case "storage":
      return checkStorageIntegration();
  }
}
