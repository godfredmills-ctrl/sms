import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * School-editable settings.
 *
 * The split with `env.ts` is deliberate and worth stating once: **secrets stay
 * in the environment.** An API key stored in a table is readable by anyone with
 * a database session, survives in every backup, and leaks through an ordinary
 * SQL injection — so provider credentials are env-only and the settings screen
 * reports on them rather than storing them. What lives here is everything a
 * school legitimately changes without a redeploy: the SMS sender ID, the
 * from-address, invoice numbering, reminder cadence, branding.
 *
 * Every value falls back to its environment default, so a school that has
 * changed nothing behaves exactly as the deployment configured it.
 */

export type SettingGroup =
  | "school"
  | "finance"
  | "messaging"
  | "attendance"
  | "grading"
  | "portal";

type Cached = { values: Record<string, unknown>; expiresAt: number };

/**
 * Settings are read on paths as hot as "send one SMS to 900 parents", so they
 * are cached per group. The TTL is short because the only cost of staleness is
 * a preference taking half a minute to take effect, and writes bust it anyway.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, Cached>();

export async function getSettingGroup(
  group: SettingGroup,
): Promise<Record<string, unknown>> {
  const hit = cache.get(group);
  if (hit && hit.expiresAt > Date.now()) return hit.values;

  const rows = await db.setting.findMany({
    where: { group },
    select: { key: true, value: true },
  });

  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  cache.set(group, { values, expiresAt: Date.now() + CACHE_TTL_MS });
  return values;
}

export async function getSetting<T>(
  group: SettingGroup,
  key: string,
  fallback: T,
): Promise<T> {
  const values = await getSettingGroup(group);
  const value = values[key];
  // A blank string is a cleared field, not an override — fall back rather than
  // sending SMS from a sender ID of "".
  if (value === undefined || value === null || value === "") return fallback;
  return value as T;
}

export async function setSettings(
  group: SettingGroup,
  values: Record<string, unknown>,
  options: { label?: (key: string) => string | undefined } = {},
): Promise<void> {
  await db.$transaction(
    Object.entries(values).map(([key, value]) =>
      db.setting.upsert({
        where: { group_key: { group, key } },
        create: { group, key, value: value as never, label: options.label?.(key) },
        update: { value: value as never },
      }),
    ),
  );
  cache.delete(group);
}

export function invalidateSettings(group?: SettingGroup): void {
  if (group) cache.delete(group);
  else cache.clear();
}

// -----------------------------------------------------------------------------
// Typed accessors for the settings the runtime actually consumes
// -----------------------------------------------------------------------------

export async function messagingSettings() {
  const values = await getSettingGroup("messaging");
  return {
    senderId: (values.senderId as string) || env.sms.senderId,
    emailFrom: (values.emailFrom as string) || env.email.from,
    replyTo: (values.replyTo as string) || "",
    signature: (values.signature as string) || "",
    /** Outside this window only urgent messages are dispatched. */
    quietHoursStart: (values.quietHoursStart as string) || "21:00",
    quietHoursEnd: (values.quietHoursEnd as string) || "06:00",
  };
}

export async function financeSettings() {
  const values = await getSettingGroup("finance");
  return {
    invoicePrefix: (values.invoicePrefix as string) || "INV",
    receiptPrefix: (values.receiptPrefix as string) || "RCT",
    /** Days after the due date before an invoice is treated as overdue. */
    graceDays: Number(values.graceDays ?? 7),
    lateFeePercent: Number(values.lateFeePercent ?? 0),
    /** Reminders fire this many days before the due date. */
    reminderLeadDays: Number(values.reminderLeadDays ?? 7),
    allowPartPayment: values.allowPartPayment !== false,
  };
}
