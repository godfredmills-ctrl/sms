/**
 * What an integration is, described once.
 *
 * This module is pure and client-safe: the form that collects credentials, the
 * page that reports on them, the resolver that hands them to a provider and the
 * script that checks the build all read the same list. The alternative — a
 * form listing one set of fields and a sender reading another — is the bug this
 * system keeps finding in itself: two parts written at different times that
 * disagree, where neither errors. Here they cannot disagree, because there is
 * only one description.
 *
 * Every field is named for the environment variable it corresponds to, because
 * that is the name in the deployment's dashboard, in `.env.example`, and in
 * every support conversation a school will ever have with a provider.
 */

export type IntegrationId = "payments" | "sms" | "email" | "push" | "ai" | "storage";

export type FieldKind = "text" | "secret" | "number" | "boolean";

export type Field = {
  /** The environment variable name. Also the storage key. */
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  help?: string;
  /** Shown only when the integration's provider is one of these. */
  onlyFor?: string[];
  /** Without it the provider cannot work at all. */
  required?: boolean;
};

export type ProviderChoice = {
  value: string;
  label: string;
  blurb: string;
  /** Where a school signs up. Shown next to the choice. */
  signUp?: string;
};

export type Integration = {
  id: IntegrationId;
  name: string;
  blurb: string;
  /** The variable naming which provider is in use, when there is a choice. */
  providerKey?: string;
  providers: ProviderChoice[];
  fields: Field[];
  /** Something true about this integration that is not a field. */
  note?: string;
  /**
   * Deployment-only integrations cannot be changed from the settings screen.
   * Reserved for settings where a change strands data rather than redirecting
   * it — see storage below.
   */
  envOnly?: boolean;
  /** Why it is deployment-only. Shown in place of the form. */
  envOnlyReason?: string;
};

export const INTEGRATIONS: Integration[] = [
  {
    id: "payments",
    name: "Payments",
    blurb:
      "How a parent pays fees online. Without it the portal still shows what is owed, and the bursar still records cash at the desk.",
    providerKey: "PAYMENT_PROVIDER",
    providers: [
      {
        value: "mock",
        label: "Test gateway",
        blurb: "Simulated checkout. Payments are recorded but no money moves.",
      },
      {
        value: "paystack",
        label: "Paystack",
        blurb:
          "One integration covers MTN, Telecel and AirtelTigo mobile money, cards, bank transfer and USSD.",
        signUp: "https://dashboard.paystack.com/#/settings/developers",
      },
      {
        value: "hubtel",
        label: "Hubtel",
        blurb: "Mobile money and card, with a Ghanaian merchant account.",
        signUp: "https://unity.hubtel.com",
      },
    ],
    fields: [
      {
        key: "PAYSTACK_SECRET_KEY",
        label: "Secret key",
        kind: "secret",
        onlyFor: ["paystack"],
        required: true,
        placeholder: "sk_live_… or sk_test_…",
        help: "Paystack dashboard → Settings → API Keys & Webhooks. Never appears in a browser.",
      },
      {
        key: "PAYSTACK_PUBLIC_KEY",
        label: "Public key",
        kind: "text",
        onlyFor: ["paystack"],
        placeholder: "pk_live_… or pk_test_…",
        help: "Safe to expose. Only needed if you embed Paystack's own checkout form.",
      },
      {
        key: "HUBTEL_CLIENT_ID",
        label: "Client ID",
        kind: "text",
        onlyFor: ["hubtel"],
        required: true,
      },
      {
        key: "HUBTEL_CLIENT_SECRET",
        label: "Client secret",
        kind: "secret",
        onlyFor: ["hubtel"],
        required: true,
      },
      {
        key: "HUBTEL_MERCHANT_ACCOUNT",
        label: "Merchant account number",
        kind: "text",
        onlyFor: ["hubtel"],
        required: true,
        help: "The account fees are settled into.",
      },
    ],
  },

  {
    id: "sms",
    name: "SMS",
    blurb:
      "Fee reminders, absence alerts and announcements to a parent's phone. The one channel that reaches every family in Ghana.",
    providerKey: "SMS_PROVIDER",
    providers: [
      {
        value: "mock",
        label: "Logged only",
        blurb:
          "Messages are written to the server log, never delivered. Costs are still estimated so a broadcast can be rehearsed.",
      },
      {
        value: "arkesel",
        label: "Arkesel",
        blurb: "Ghanaian aggregator. Per-message billing, delivery reports.",
        signUp: "https://sms.arkesel.com",
      },
      {
        value: "mnotify",
        label: "mNotify",
        blurb: "Ghanaian aggregator with campaign reporting.",
        signUp: "https://app.mnotify.com",
      },
      {
        value: "hubtel",
        label: "Hubtel SMS",
        blurb: "Same account as Hubtel payments, different credentials.",
        signUp: "https://unity.hubtel.com",
      },
    ],
    note: "The sender ID a parent sees is set under Messaging preferences below, not here. It must be registered with your provider first — an unregistered sender ID is the usual reason messages are accepted and never arrive.",
    fields: [
      {
        key: "ARKESEL_API_KEY",
        label: "API key",
        kind: "secret",
        onlyFor: ["arkesel"],
        required: true,
        help: "Arkesel dashboard → API keys.",
      },
      {
        key: "MNOTIFY_API_KEY",
        label: "API key",
        kind: "secret",
        onlyFor: ["mnotify"],
        required: true,
        help: "mNotify dashboard → Developer → API key.",
      },
      {
        key: "HUBTEL_SMS_CLIENT_ID",
        label: "SMS client ID",
        kind: "text",
        onlyFor: ["hubtel"],
        required: true,
      },
      {
        key: "HUBTEL_SMS_CLIENT_SECRET",
        label: "SMS client secret",
        kind: "secret",
        onlyFor: ["hubtel"],
        required: true,
      },
    ],
  },

  {
    id: "email",
    name: "Email",
    blurb:
      "Statements, report cards, invitations and password resets. Anything that needs an attachment or more than 160 characters.",
    providerKey: "EMAIL_PROVIDER",
    providers: [
      {
        value: "mock",
        label: "Logged only",
        blurb: "Email is written to the server log, never sent.",
      },
      {
        value: "smtp",
        label: "SMTP",
        blurb:
          "Any mail host — Google Workspace, Microsoft 365, Zoho, Brevo, Mailgun, or the school's own server.",
      },
    ],
    note: "The from-address is set under Messaging preferences below, not here. It must be an address the mail host is willing to send as, or the message is rejected or filed as spam.",
    fields: [
      {
        key: "SMTP_HOST",
        label: "Host",
        kind: "text",
        onlyFor: ["smtp"],
        required: true,
        placeholder: "smtp.gmail.com",
      },
      {
        key: "SMTP_PORT",
        label: "Port",
        kind: "number",
        onlyFor: ["smtp"],
        placeholder: "587",
        help: "587 with STARTTLS is the usual choice; 465 needs the TLS box ticked.",
      },
      {
        key: "SMTP_SECURE",
        label: "Connect over TLS immediately (port 465)",
        kind: "boolean",
        onlyFor: ["smtp"],
      },
      {
        key: "SMTP_USER",
        label: "Username",
        kind: "text",
        onlyFor: ["smtp"],
      },
      {
        key: "SMTP_PASSWORD",
        label: "Password",
        kind: "secret",
        onlyFor: ["smtp"],
        help: "For Google Workspace or Microsoft 365 this is an app password, not the account's own password.",
      },
    ],
  },

  {
    id: "push",
    name: "Push notifications",
    blurb:
      "Alerts on a phone that has installed the app, with no per-message cost. The cheapest channel the school has.",
    providers: [],
    fields: [
      {
        key: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
        label: "Public key",
        kind: "text",
        required: true,
        help: "Sent to the browser so it can subscribe.",
      },
      {
        key: "VAPID_PRIVATE_KEY",
        label: "Private key",
        kind: "secret",
        required: true,
        help: "Signs each notification. Must be the pair of the public key above.",
      },
      {
        key: "VAPID_SUBJECT",
        label: "Contact",
        kind: "text",
        placeholder: "mailto:admin@school.edu.gh",
        help: "A mailto: or https: address the push service can use to reach the school if something goes wrong.",
      },
    ],
  },

  {
    id: "ai",
    name: "AI insights",
    blurb:
      "Report-card remarks, teaching analytics and written summaries of a term's results. Everything works without it; nothing depends on it.",
    providers: [],
    fields: [
      {
        key: "ANTHROPIC_API_KEY",
        label: "API key",
        kind: "secret",
        required: true,
        placeholder: "sk-ant-…",
        help: "console.anthropic.com → API keys.",
      },
      {
        key: "ANTHROPIC_MODEL",
        label: "Model",
        kind: "text",
        placeholder: "claude-opus-5",
        help: "Leave blank for the default. A model that does not exist is reported by the test below rather than discovered on a report card.",
      },
      {
        key: "AI_ENABLED",
        label: "Allow AI features",
        kind: "boolean",
        help: "Turn off to disable every AI feature at once, whatever the key says.",
      },
    ],
  },

  {
    id: "storage",
    name: "File storage",
    blurb:
      "Where uploaded photographs, medical forms and signed documents are kept.",
    providerKey: "STORAGE_DRIVER",
    providers: [
      {
        value: "local",
        label: "Local disk",
        blurb: "A directory on the server. Needs a mounted volume in production.",
      },
      {
        value: "s3",
        label: "S3-compatible",
        blurb: "Cloudflare R2, Backblaze B2, MinIO, Amazon S3.",
      },
    ],
    envOnly: true,
    envOnlyReason:
      "Storage is set on the deployment, not here. Every other setting on this page redirects where new things go; changing this one would orphan everything already stored — a pupil's photograph and a signed consent form would still exist, and nothing would be able to find them.",
    fields: [
      { key: "STORAGE_LOCAL_DIR", label: "Directory", kind: "text", onlyFor: ["local"] },
      { key: "S3_ENDPOINT", label: "Endpoint", kind: "text", onlyFor: ["s3"], required: true },
      { key: "S3_BUCKET", label: "Bucket", kind: "text", onlyFor: ["s3"], required: true },
      { key: "S3_REGION", label: "Region", kind: "text", onlyFor: ["s3"] },
      { key: "S3_ACCESS_KEY_ID", label: "Access key ID", kind: "text", onlyFor: ["s3"], required: true },
      {
        key: "S3_SECRET_ACCESS_KEY",
        label: "Secret access key",
        kind: "secret",
        onlyFor: ["s3"],
        required: true,
      },
    ],
  },
];

// -----------------------------------------------------------------------------
// Lookups
// -----------------------------------------------------------------------------

export function integrationById(id: string): Integration | undefined {
  return INTEGRATIONS.find((integration) => integration.id === id);
}

/** Every key any integration knows about — the allow-list for what may be stored. */
export function allIntegrationKeys(): string[] {
  const keys = new Set<string>();
  for (const integration of INTEGRATIONS) {
    if (integration.providerKey) keys.add(integration.providerKey);
    for (const field of integration.fields) keys.add(field.key);
  }
  return [...keys];
}

export function fieldByKey(key: string): Field | undefined {
  for (const integration of INTEGRATIONS) {
    const field = integration.fields.find((candidate) => candidate.key === key);
    if (field) return field;
  }
  return undefined;
}

/** The fields that apply given the chosen provider. */
export function fieldsFor(integration: Integration, provider: string): Field[] {
  return integration.fields.filter(
    (field) => !field.onlyFor || field.onlyFor.includes(provider),
  );
}

export function providerLabel(integration: Integration, value: string): string {
  return (
    integration.providers.find((provider) => provider.value === value)?.label ?? value
  );
}

/**
 * Is this provider name one the dispatching code actually handles?
 *
 * "Not mock" is not the same as "recognised". The status cards used to call a
 * provider live whenever its name was anything but "mock", while the code that
 * dispatches switches on a fixed list — so a typo in SMS_PROVIDER produced a
 * green badge and nothing delivered anywhere. Asking the catalogue is asking
 * the same question the dispatcher answers.
 */
export function isKnownProvider(integration: Integration, value: string): boolean {
  if (!integration.providers.length) return true;
  return integration.providers.some((provider) => provider.value === value);
}

// -----------------------------------------------------------------------------
// Masking
// -----------------------------------------------------------------------------

/**
 * What a stored secret is allowed to look like on screen.
 *
 * Enough to recognise which key is in there — a bursar who has rotated a
 * Paystack key twice needs to tell them apart — and not enough to use. Short
 * values reveal nothing at all, because the last four characters of a
 * six-character secret is most of it.
 */
export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length < 12) return "•".repeat(8);
  return `${"•".repeat(8)}${trimmed.slice(-4)}`;
}

/**
 * Where a value came from. The environment always wins: a deployment that
 * pins a key in its own variables must not have it quietly replaced from a
 * settings screen, and an operator reading the dashboard has to be able to
 * trust what it says.
 */
export type ValueSource = "environment" | "database" | "unset";

export function sourceOf(
  envValue: string | undefined,
  dbValue: string | null | undefined,
): ValueSource {
  if (envValue !== undefined && envValue.trim() !== "") return "environment";
  if (dbValue !== null && dbValue !== undefined && dbValue.trim() !== "") return "database";
  return "unset";
}

export function resolve(
  envValue: string | undefined,
  dbValue: string | null | undefined,
  fallback = "",
): string {
  const source = sourceOf(envValue, dbValue);
  if (source === "environment") return envValue!.trim();
  if (source === "database") return dbValue!.trim();
  return fallback;
}

/** Parses the string forms a boolean field can be stored as. */
export function asBoolean(value: string, fallback: boolean): boolean {
  const raw = value.trim().toLowerCase();
  if (raw === "") return fallback;
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}
