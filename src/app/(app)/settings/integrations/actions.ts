"use server";

import { revalidatePath } from "next/cache";
import webpush from "web-push";

import { authorize } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  fieldsFor,
  integrationById,
  isKnownProvider,
  type IntegrationId,
} from "@/lib/integrations/catalogue";
import {
  fieldStates,
  integrationConfig,
  providerInUse,
  saveIntegrationValues,
} from "@/lib/integrations/config";
import { checkIntegration, sendTestEmail, sendTestSms } from "@/lib/integrations/tests";

export type IntegrationFormState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Set when a live check ran, so the page can show its own tone. */
  checked?: { ok: boolean; detail: string; inconclusive?: boolean };
};

/**
 * The sentinel a masked secret comes back as.
 *
 * A form that renders "••••4821" into a password field posts that string back
 * on save. Writing it would replace a working key with eight bullets and four
 * digits, and the integration would report "configured" while every send
 * failed — so a value that still looks like its own mask is treated as
 * unchanged rather than as new.
 */
function isUnchangedMask(value: string): boolean {
  return /^•+/.test(value.trim());
}

async function actor(permission: string) {
  const user = await authorize(permission);
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return { userId: user.id, label: name || user.email || null };
}

export async function saveIntegrationAction(
  _previous: IntegrationFormState,
  formData: FormData,
): Promise<IntegrationFormState> {
  let who;
  try {
    who = await actor("settings.integration.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = String(formData.get("integration") ?? "") as IntegrationId;
  const integration = integrationById(id);
  if (!integration) return { error: "Unknown integration." };
  if (integration.envOnly) {
    return { error: `${integration.name} is set on the deployment, not here.` };
  }

  const values: Record<string, string> = {};

  // The provider first: which fields are even applicable depends on it.
  let provider = "";
  if (integration.providerKey) {
    if (formData.has(integration.providerKey)) {
      provider = String(formData.get(integration.providerKey)).trim().toLowerCase();
      if (!isKnownProvider(integration, provider)) {
        return { error: `"${provider}" is not a provider this system can send through.` };
      }
      values[integration.providerKey] = provider;
    } else {
      // The select is rendered disabled when the deployment pins the provider,
      // and a disabled control posts nothing. Reading the absence as an empty
      // string would reject the save with `"" is not a provider` — so a school
      // whose provider is pinned could not change any other field at all. Take
      // the resolved provider and leave it unwritten.
      provider = providerInUse(await integrationConfig(), id);
    }
  }

  for (const field of fieldsFor(integration, provider)) {
    if (field.kind === "boolean") {
      values[field.key] = formData.get(field.key) === "on" ? "true" : "false";
      continue;
    }

    // A field the form did not render must not be cleared. Fields hidden
    // because another provider is selected are absent from the POST entirely,
    // and treating absent as empty would wipe a school's Paystack key the
    // moment they looked at the Hubtel form.
    if (!formData.has(field.key)) continue;

    const raw = String(formData.get(field.key) ?? "");
    if (field.kind === "secret" && isUnchangedMask(raw)) continue;
    values[field.key] = raw;
  }

  // Refusing to save a provider whose required fields are blank would be worse
  // than saving it: a school pastes the key on Tuesday and the client ID on
  // Wednesday. The page reports what is still missing instead.
  const { changed } = await saveIntegrationValues(values, who);

  await db.auditLog.create({
    data: {
      userId: who.userId,
      actorLabel: who.label,
      action: "settings.integration.update",
      entity: "IntegrationSetting",
      entityId: id,
      // Names only. The whole point of encrypting the column is defeated by
      // writing the value into an audit row beside it.
      summary: `Updated ${integration.name}: ${changed.join(", ") || "no change"}`,
    },
  });

  revalidatePath("/settings/integrations");
  return { ok: true, message: `${integration.name} saved.` };
}

export async function testIntegrationAction(
  _previous: IntegrationFormState,
  formData: FormData,
): Promise<IntegrationFormState> {
  try {
    await authorize("settings.integration.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const id = String(formData.get("integration") ?? "") as IntegrationId;
  const integration = integrationById(id);
  if (!integration) return { error: "Unknown integration." };

  try {
    return { ok: true, checked: await checkIntegration(id) };
  } catch (error) {
    return { ok: true, checked: { ok: false, detail: (error as Error).message } };
  }
}

/**
 * Sends one real message, to an address or number somebody typed.
 *
 * Separated from the connection check because it costs the school money and
 * reaches a real person. Nothing here fires without a destination.
 */
export async function sendTestMessageAction(
  _previous: IntegrationFormState,
  formData: FormData,
): Promise<IntegrationFormState> {
  let who;
  try {
    who = await actor("settings.integration.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  const channel = String(formData.get("channel") ?? "");
  const destination = String(formData.get("destination") ?? "").trim();
  if (!destination) {
    return {
      error: channel === "sms" ? "Type a phone number to send to." : "Type an email address.",
    };
  }

  const result =
    channel === "sms" ? await sendTestSms(destination) : await sendTestEmail(destination);

  await db.auditLog.create({
    data: {
      userId: who.userId,
      actorLabel: who.label,
      action: "settings.integration.test",
      entity: "IntegrationSetting",
      entityId: channel,
      summary: `Test ${channel} to ${destination}: ${result.ok ? "accepted" : "failed"}`,
    },
  });

  return { ok: true, checked: result };
}

/**
 * Generates a VAPID key pair and stores it.
 *
 * Push is the one integration a school can finish without signing up for
 * anything — the keys are pure local cryptography, they cost nothing, and
 * there is no account behind them. Making somebody run
 * `npx web-push generate-vapid-keys` on a machine they do not have is the only
 * reason it was ever left unconfigured.
 */
export async function generateVapidKeysAction(
  _previous: IntegrationFormState,
): Promise<IntegrationFormState> {
  let who;
  try {
    who = await actor("settings.integration.manage");
  } catch (error) {
    return { error: (error as Error).message };
  }

  // Refuse rather than pretend. The environment wins over anything stored, so
  // generating a pair while these are pinned would save keys nothing would
  // ever use, report success, and leave the page showing the old ones — the
  // button appearing to work being worse than the button being unavailable.
  const states = await fieldStates();
  const pinned = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"].filter(
    (key) => states.get(key)?.source === "environment",
  );

  if (pinned.length) {
    return {
      error: `${pinned.join(" and ")} ${pinned.length === 1 ? "is" : "are"} set in the deployment's environment variables, which take precedence over anything saved here. Generate the pair with \`npm run setup:integrations\`, or remove those variables to manage the keys from this screen.`,
    };
  }

  const keys = webpush.generateVAPIDKeys();

  await saveIntegrationValues(
    {
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
    },
    who,
  );

  await db.auditLog.create({
    data: {
      userId: who.userId,
      actorLabel: who.label,
      action: "settings.integration.update",
      entity: "IntegrationSetting",
      entityId: "push",
      summary: "Generated a new VAPID key pair",
    },
  });

  revalidatePath("/settings/integrations");
  return {
    ok: true,
    message:
      "A new key pair was generated and saved. Anyone already subscribed to notifications will need to allow them again — the old key can no longer sign anything.",
  };
}
