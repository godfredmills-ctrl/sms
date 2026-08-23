import "server-only";

import { db } from "@/lib/db";
import { env, rawEnv } from "@/lib/env";

import {
  allIntegrationKeys,
  INTEGRATIONS,
  asBoolean,
  fieldByKey,
  maskSecret,
  resolve,
  resolveProvider,
  sourceOf,
  integrationById,
  type IntegrationId,
  type ValueSource,
} from "./catalogue";
import { decryptSecret, encryptSecret } from "./secrets";

/**
 * The one place a provider credential is read.
 *
 * Every sender, gateway and client in the system asks this module what it is
 * configured with. Nothing reads `env.sms.*`, `env.payments.*`, `env.email.*`,
 * `env.push.*` or `env.ai.*` any more, and a build guard
 * (`scripts/check-integration-reads.mjs`) refuses the build if anything starts
 * to again — because the failure it prevents is silent. A key typed into the
 * settings screen, stored, shown as configured, and then ignored by a sender
 * still reading the environment is not an error anywhere: the school sees a
 * green badge and the parents get nothing.
 *
 * Precedence, once: **the environment wins where it is set.** A deployment
 * that pins ARKESEL_API_KEY in its own variables keeps it, whatever the
 * database says; where the environment is silent, the stored value is used.
 * That way an operator reading the hosting dashboard can trust what they see,
 * and a school with no operator can still configure itself.
 *
 * With one exception, for the provider key only: naming the built-in fallback
 * is not a configuration. See `resolveProvider` in the catalogue for why —
 * shipping without it locked every deployment out of this screen.
 */

export type ResolvedPayments = {
  provider: string;
  paystackSecret: string;
  paystackPublic: string;
  hubtelClientId: string;
  hubtelClientSecret: string;
  hubtelMerchant: string;
};

export type ResolvedSms = {
  provider: string;
  arkeselKey: string;
  mnotifyKey: string;
  hubtelClientId: string;
  hubtelClientSecret: string;
};

export type ResolvedEmail = {
  provider: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

export type ResolvedPush = {
  publicKey: string;
  privateKey: string;
  subject: string;
  enabled: boolean;
};

export type ResolvedAi = {
  enabled: boolean;
  apiKey: string;
  model: string;
};

export type ResolvedIntegrations = {
  payments: ResolvedPayments;
  sms: ResolvedSms;
  email: ResolvedEmail;
  push: ResolvedPush;
  ai: ResolvedAi;
  /**
   * Stored credentials that exist and could not be decrypted, by key. Never
   * silently treated as absent — see `decryptSecret`.
   */
  unreadable: string[];
};

// -----------------------------------------------------------------------------
// Stored values
// -----------------------------------------------------------------------------

type StoredValue = { value: string | null; unreadable: boolean; updatedAt: Date };
type Stored = Map<string, StoredValue>;

/**
 * Read on paths as hot as "send one SMS to 900 parents", so the resolved
 * configuration is cached for the same short window the settings cache uses.
 * The only cost of staleness is a newly pasted key taking half a minute to
 * take effect, and every write clears it.
 */
const CACHE_TTL_MS = 30_000;

let cache: { config: ResolvedIntegrations; expiresAt: number } | null = null;

export function clearIntegrationCache(): void {
  cache = null;
}

async function readStored(): Promise<Stored> {
  const rows = await db.integrationSetting.findMany({
    select: { key: true, value: true, isSecret: true, updatedAt: true },
  });

  const stored: Stored = new Map();
  for (const row of rows) {
    if (!row.isSecret) {
      stored.set(row.key, { value: row.value, unreadable: false, updatedAt: row.updatedAt });
      continue;
    }
    const plain = decryptSecret(row.value);
    stored.set(row.key, {
      value: plain,
      unreadable: plain === null,
      updatedAt: row.updatedAt,
    });
  }
  return stored;
}

function pick(stored: Stored, key: string, fallback = ""): string {
  return resolve(rawEnv(key) || undefined, stored.get(key)?.value, fallback);
}

/** The provider key, which has its own precedence rule — see resolveProvider. */
function pickProvider(stored: Stored, id: IntegrationId): string {
  const integration = integrationById(id)!;
  const key = integration.providerKey!;
  return resolveProvider(integration, rawEnv(key) || undefined, stored.get(key)?.value)
    .value;
}

// -----------------------------------------------------------------------------
// Resolution
// -----------------------------------------------------------------------------

function build(stored: Stored): ResolvedIntegrations {
  const unreadable = [...stored.entries()]
    .filter(([, entry]) => entry.unreadable)
    .map(([key]) => key)
    // A value the environment supplies is not affected by a database row that
    // cannot be read, so it is not a fault to report.
    .filter((key) => !rawEnv(key));

  const pushPublic = pick(stored, "NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const pushPrivate = pick(stored, "VAPID_PRIVATE_KEY");
  const apiKey = pick(stored, "ANTHROPIC_API_KEY");

  const port = Number.parseInt(pick(stored, "SMTP_PORT", "587"), 10);

  return {
    payments: {
      provider: pickProvider(stored, "payments"),
      paystackSecret: pick(stored, "PAYSTACK_SECRET_KEY"),
      paystackPublic: pick(stored, "PAYSTACK_PUBLIC_KEY"),
      hubtelClientId: pick(stored, "HUBTEL_CLIENT_ID"),
      hubtelClientSecret: pick(stored, "HUBTEL_CLIENT_SECRET"),
      hubtelMerchant: pick(stored, "HUBTEL_MERCHANT_ACCOUNT"),
    },
    sms: {
      provider: pickProvider(stored, "sms"),
      arkeselKey: pick(stored, "ARKESEL_API_KEY"),
      mnotifyKey: pick(stored, "MNOTIFY_API_KEY"),
      hubtelClientId: pick(stored, "HUBTEL_SMS_CLIENT_ID"),
      hubtelClientSecret: pick(stored, "HUBTEL_SMS_CLIENT_SECRET"),
    },
    email: {
      provider: pickProvider(stored, "email"),
      host: pick(stored, "SMTP_HOST"),
      port: Number.isFinite(port) ? port : 587,
      secure: asBoolean(pick(stored, "SMTP_SECURE"), false),
      user: pick(stored, "SMTP_USER"),
      password: pick(stored, "SMTP_PASSWORD"),
    },
    push: {
      publicKey: pushPublic,
      privateKey: pushPrivate,
      subject: pick(stored, "VAPID_SUBJECT", "mailto:admin@school.edu.gh"),
      enabled: Boolean(pushPublic && pushPrivate),
    },
    ai: {
      // AI_ENABLED is a hard switch: off means off, whatever key is present.
      enabled: asBoolean(pick(stored, "AI_ENABLED"), true) && Boolean(apiKey),
      apiKey,
      model: pick(stored, "ANTHROPIC_MODEL", "claude-opus-5"),
    },
    unreadable,
  };
}

export async function integrationConfig(): Promise<ResolvedIntegrations> {
  if (cache && cache.expiresAt > Date.now()) return cache.config;
  const config = build(await readStored());
  cache = { config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
}

/**
 * Which provider each integration is actually dispatching through.
 *
 * The status card, the form and the save action all need this answer, and it
 * has to be the same answer in all three — a page offering the Hubtel fields
 * while the action decides the provider is Paystack would save the right
 * values under the wrong assumption and report success.
 */
export function providerInUse(
  config: ResolvedIntegrations,
  id: IntegrationId,
): string {
  switch (id) {
    case "payments":
      return config.payments.provider;
    case "sms":
      return config.sms.provider;
    case "email":
      return config.email.provider;
    case "push":
      return config.push.enabled ? "web-push" : "off";
    case "ai":
      return config.ai.enabled ? config.ai.model : "off";
    case "storage":
      return env.storage.driver;
  }
}

/*
 * There is deliberately no env-only variant of the above.
 *
 * It is tempting — the settings page could then render when the database is
 * unreachable — but a sender that quietly fell back to the environment would
 * revert a school's configured Arkesel account to the mock provider and go on
 * reporting every reminder as sent. Failing is the honest outcome, and a
 * deployment whose database is unreachable has no working page to protect.
 */

// -----------------------------------------------------------------------------
// The settings screen's view
// -----------------------------------------------------------------------------

export type FieldState = {
  key: string;
  source: ValueSource;
  /** Masked for secrets, plain for everything else. Never the secret itself. */
  display: string;
  unreadable: boolean;
  updatedAt: Date | null;
};

/**
 * What each field looks like on screen: where it came from, enough of it to
 * recognise, and never enough to use. Secrets are masked here rather than in
 * the page, so a future page cannot forget to.
 */
export async function fieldStates(): Promise<Map<string, FieldState>> {
  const stored = await readStored();
  const states = new Map<string, FieldState>();

  // Provider keys resolve by their own rule, so the screen agrees with the
  // dispatcher about which one is pinned and which one may still be chosen.
  const providerKeys = new Map(
    INTEGRATIONS.filter((integration) => integration.providerKey).map((integration) => [
      integration.providerKey!,
      integration,
    ]),
  );

  for (const key of allIntegrationKeys()) {
    const fromEnv = rawEnv(key);
    const entry = stored.get(key);

    const integration = providerKeys.get(key);
    const resolved = integration
      ? resolveProvider(integration, fromEnv || undefined, entry?.value)
      : null;

    const source = resolved
      ? resolved.source
      : sourceOf(fromEnv || undefined, entry?.value);
    const isSecret = fieldByKey(key)?.kind === "secret";
    const value = resolved
      ? resolved.value
      : source === "environment"
        ? fromEnv
        : (entry?.value ?? "");

    states.set(key, {
      key,
      source,
      display: isSecret ? maskSecret(value) : value,
      unreadable: Boolean(entry?.unreadable) && !fromEnv,
      updatedAt: entry?.updatedAt ?? null,
    });
  }

  return states;
}

// -----------------------------------------------------------------------------
// Writing
// -----------------------------------------------------------------------------

/**
 * Stores values for the given keys.
 *
 * A key absent from `values` is left alone; a key present with an empty string
 * is cleared. That distinction matters on a form where secrets come back
 * masked: the browser posts the mask, not the secret, so the action drops
 * unchanged secret fields rather than writing "••••4821" over a live key.
 */
export async function saveIntegrationValues(
  values: Record<string, string>,
  actor: { userId: string; label?: string | null },
): Promise<{ changed: string[] }> {
  const allowed = new Set(allIntegrationKeys());
  const changed: string[] = [];

  for (const [key, raw] of Object.entries(values)) {
    // An unknown key is a bug or an attempt, never a new setting. The
    // catalogue is the allow-list, so a crafted POST cannot turn this table
    // into arbitrary storage.
    if (!allowed.has(key)) continue;

    const value = raw.trim();
    const isSecret = fieldByKey(key)?.kind === "secret";

    if (!value) {
      await db.integrationSetting.deleteMany({ where: { key } });
      changed.push(key);
      continue;
    }

    await db.integrationSetting.upsert({
      where: { key },
      create: {
        key,
        value: isSecret ? encryptSecret(value) : value,
        isSecret,
        updatedById: actor.userId,
        updatedByLabel: actor.label ?? null,
      },
      update: {
        value: isSecret ? encryptSecret(value) : value,
        isSecret,
        updatedById: actor.userId,
        updatedByLabel: actor.label ?? null,
      },
    });
    changed.push(key);
  }

  clearIntegrationCache();
  return { changed };
}
