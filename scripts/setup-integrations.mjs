#!/usr/bin/env node
/**
 * Sets up what can be set up without an account, and reports honestly on the
 * rest.
 *
 * Three of this system's integrations need somebody to sign up with a
 * provider — a school cannot be given a Paystack key by a script. Three do
 * not: the push notification key pair is pure local cryptography, and the
 * session and cron secrets are just random bytes. Those three were left
 * unconfigured for no better reason than that nobody had run the command, so
 * this runs it.
 *
 * Everything it writes goes to `.env`, and it never overwrites a value that is
 * already set unless asked with --force. Run it with --check to report only.
 *
 *   node scripts/setup-integrations.mjs            generate what is missing
 *   node scripts/setup-integrations.mjs --check    report, change nothing
 *   node scripts/setup-integrations.mjs --force    regenerate even if set
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import webpush from "web-push";

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, ".env");

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check");
const FORCE = args.has("--force");

// -----------------------------------------------------------------------------
// Reading .env
// -----------------------------------------------------------------------------

/**
 * A deliberately small parser, matching what the app itself sees.
 *
 * Quotes are stripped because dotenv strips them, and an inline `# comment` on
 * an unquoted value is dropped for the same reason. Getting this wrong in
 * either direction would make the report disagree with the running app, which
 * is worse than not reporting at all.
 */
function parseEnvFile(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals < 0) continue;

    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();

    // Order matters, and getting it wrong is not obvious. `FOO="mock"  # note`
    // does not end in a quote, so a starts-and-ends test misses it and leaves
    // the quotes on the value — after which "mock" never equals mock and every
    // provider in the file reads as one this system does not know. Find the
    // closing quote instead, and only look for a trailing comment on values
    // that were not quoted at all.
    if (value[0] === '"' || value[0] === "'") {
      const quote = value[0];
      const closing = value.indexOf(quote, 1);
      value = closing > 0 ? value.slice(1, closing) : value.slice(1);
    } else {
      const comment = value.search(/\s#/);
      if (comment >= 0) value = value.slice(0, comment).trim();
    }

    values.set(key, value);
  }
  return values;
}

const fileText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
const fromFile = parseEnvFile(fileText);

/** The environment wins over the file, exactly as it does in the app. */
function current(key) {
  const live = process.env[key]?.trim();
  if (live) return { value: live, source: "environment" };
  const stored = fromFile.get(key)?.trim();
  if (stored) return { value: stored, source: ".env" };
  return { value: "", source: "unset" };
}

const PLACEHOLDERS = [
  "change-me",
  "change-me-to-a-long-random-string-at-least-32-chars",
  "development-only-insecure-secret-change-me",
];

function isPlaceholder(value) {
  return PLACEHOLDERS.some((placeholder) => value === placeholder);
}

// -----------------------------------------------------------------------------
// Writing .env
// -----------------------------------------------------------------------------

const pending = new Map();

function setValue(key, value) {
  pending.set(key, value);
}

/**
 * Rewrites in place where the key already exists, appends where it does not,
 * and leaves every comment and blank line alone — this file is the operator's,
 * not ours.
 */
function writeEnvFile() {
  if (!pending.size) return;

  const lines = fileText ? fileText.split(/\r?\n/) : [];
  const written = new Set();

  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const equals = trimmed.indexOf("=");
    if (equals < 0) return line;

    const key = trimmed.slice(0, equals).trim();
    if (!pending.has(key)) return line;

    written.add(key);
    return `${key}=${pending.get(key)}`;
  });

  const appended = [];
  for (const [key, value] of pending) {
    if (!written.has(key)) appended.push(`${key}=${value}`);
  }

  if (appended.length) {
    if (updated.length && updated[updated.length - 1].trim() !== "") updated.push("");
    updated.push("# --- Added by `npm run setup:integrations` ---");
    updated.push(...appended);
    updated.push("");
  }

  writeFileSync(ENV_PATH, updated.join("\n"), "utf8");
}

// -----------------------------------------------------------------------------

const report = [];

function line(state, name, detail) {
  const mark = state === "ok" ? "  ok " : state === "done" ? "  set" : state === "warn" ? "  !! " : "  -- ";
  report.push(`${mark} ${name.padEnd(22)} ${detail}`);
}

// --- Secrets that are only random bytes --------------------------------------

for (const [key, bytes, what] of [
  ["SESSION_SECRET", 48, "signs session cookies"],
  ["CRON_SECRET", 32, "guards the scheduled-job endpoints"],
]) {
  const existing = current(key);

  if (existing.value && !isPlaceholder(existing.value) && !FORCE) {
    line("ok", key, `already set (${existing.source})`);
    continue;
  }

  const why = isPlaceholder(existing.value)
    ? "still the placeholder from .env.example"
    : existing.value
      ? "regenerated"
      : "was not set";

  if (CHECK_ONLY) {
    line("warn", key, `${why}, ${what}`);
    continue;
  }

  setValue(key, randomBytes(bytes).toString("base64url"));
  line("done", key, `generated (${why})`);
}

// --- Push notifications -------------------------------------------------------

const publicKey = current("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
const privateKey = current("VAPID_PRIVATE_KEY");

if (publicKey.value && privateKey.value && !FORCE) {
  line("ok", "Push notifications", `key pair already set (${publicKey.source})`);
} else if (CHECK_ONLY) {
  line("warn", "Push notifications", "no key pair: push is off, and it costs nothing to turn on");
} else {
  const keys = webpush.generateVAPIDKeys();
  setValue("NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey);
  setValue("VAPID_PRIVATE_KEY", keys.privateKey);
  if (!current("VAPID_SUBJECT").value) {
    setValue("VAPID_SUBJECT", "mailto:admin@school.edu.gh");
  }
  line("done", "Push notifications", "generated a VAPID key pair: push is now available");
}

// --- Storage -------------------------------------------------------------------

const driver = current("STORAGE_DRIVER").value || "local";
if (driver === "local") {
  const dir = current("STORAGE_LOCAL_DIR").value || "./storage/uploads";
  if (path.isAbsolute(dir)) {
    line("ok", "File storage", `local, at ${dir}`);
  } else {
    line(
      "warn",
      "File storage",
      `local, at ${dir}: a relative path lives inside the container, so every upload is lost on redeploy. Point it at a mounted volume, or use S3.`,
    );
  }
} else {
  const missing = [
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ].filter((key) => !current(key).value);
  if (missing.length) line("warn", "File storage", `s3, missing ${missing.join(", ")}`);
  else line("ok", "File storage", `s3, bucket ${current("S3_BUCKET").value}`);
}

// --- The ones that need an account ---------------------------------------------

const ACCOUNT_NEEDED = [
  {
    name: "Payments",
    providerKey: "PAYMENT_PROVIDER",
    providers: {
      paystack: ["PAYSTACK_SECRET_KEY"],
      hubtel: ["HUBTEL_CLIENT_ID", "HUBTEL_CLIENT_SECRET", "HUBTEL_MERCHANT_ACCOUNT"],
    },
    fallback: "the test gateway: fees are recorded, no money moves",
    signUp: "https://dashboard.paystack.com",
  },
  {
    name: "SMS",
    providerKey: "SMS_PROVIDER",
    providers: {
      arkesel: ["ARKESEL_API_KEY"],
      mnotify: ["MNOTIFY_API_KEY"],
      hubtel: ["HUBTEL_SMS_CLIENT_ID", "HUBTEL_SMS_CLIENT_SECRET"],
    },
    fallback: "logged to the console, never delivered",
    signUp: "https://sms.arkesel.com",
  },
  {
    name: "Email",
    providerKey: "EMAIL_PROVIDER",
    providers: { smtp: ["SMTP_HOST"] },
    fallback: "logged to the console, never sent",
    signUp: "any mail host: Google Workspace, Zoho, Brevo",
  },
];

for (const integration of ACCOUNT_NEEDED) {
  const chosen = (current(integration.providerKey).value || "mock").toLowerCase();

  if (chosen === "mock") {
    line("--", integration.name, `on the fallback: ${integration.fallback}`);
    continue;
  }

  const required = integration.providers[chosen];
  if (!required) {
    line(
      "warn",
      integration.name,
      `"${chosen}" is not a provider this system knows: nothing will be sent`,
    );
    continue;
  }

  const missing = required.filter((key) => !current(key).value);
  if (missing.length) line("warn", integration.name, `${chosen}, missing ${missing.join(", ")}`);
  else line("ok", integration.name, `${chosen}, configured`);
}

// --- AI --------------------------------------------------------------------------

const aiKey = current("ANTHROPIC_API_KEY").value;
if (!aiKey) line("--", "AI insights", "no API key: every AI feature is off, nothing else changes");
else line("ok", "AI insights", `key set, model ${current("ANTHROPIC_MODEL").value || "claude-opus-5"}`);

// -----------------------------------------------------------------------------

if (!CHECK_ONLY) writeEnvFile();

console.log("");
console.log("  Integrations");
console.log("  " + "-".repeat(70));
for (const entry of report) console.log(entry);
console.log("");

if (pending.size) {
  console.log(`  Wrote ${pending.size} value${pending.size === 1 ? "" : "s"} to .env.`);
  console.log("  Restart the app for them to take effect.");
} else if (CHECK_ONLY) {
  console.log("  Nothing was changed (--check).");
} else {
  console.log("  Nothing needed generating.");
}

console.log("");
console.log("  Anything above that needs an account is set from Settings →");
console.log("  Integrations inside the app: no redeploy, and each one has a");
console.log("  Test button that contacts the provider for real.");
console.log("");
