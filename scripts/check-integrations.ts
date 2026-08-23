/**
 * Tests for the integration catalogue and the rules that decide what is used.
 *
 * The parts under test are the ones that decide, silently, whether a school's
 * messages go out: which source a value comes from, how much of a secret is
 * allowed on screen, and whether a provider name is one the dispatcher can
 * actually act on. Every one of those has a wrong answer that looks perfectly
 * healthy from the outside.
 *
 * Encryption is exercised here too, because a round trip that quietly returns
 * the wrong thing is the failure that matters and no page would show it.
 */

import {
  allIntegrationKeys,
  asBoolean,
  fieldByKey,
  fieldsFor,
  INTEGRATIONS,
  integrationById,
  isKnownProvider,
  maskSecret,
  providerLabel,
  resolve,
  resolveProvider,
  sourceOf,
} from "../src/lib/integrations/catalogue";
// The key is derived lazily and `resetKeyCache` exists for exactly this, so a
// static import is safe: nothing is derived until the first encrypt, which
// happens after the test key is in place.
import {
  decryptSecret,
  encryptSecret,
  resetKeyCache,
} from "../src/lib/integrations/secrets";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    passed += 1;
  } else {
    failures.push(`${name}\n      expected ${b}\n      actual   ${a}`);
  }
}

function ok(name: string, condition: boolean) {
  check(name, condition, true);
}

// -----------------------------------------------------------------------------
// Precedence
// -----------------------------------------------------------------------------

check("environment wins over a stored value", resolve("from-env", "from-db"), "from-env");
check("stored value fills in where the environment is silent", resolve(undefined, "from-db"), "from-db");
check("stored value fills in where the environment is empty", resolve("", "from-db"), "from-db");
check("whitespace in the environment is not a value", resolve("   ", "from-db"), "from-db");
check("falls back when neither is set", resolve(undefined, null, "mock"), "mock");
check("an empty stored value is not a value", resolve(undefined, "", "mock"), "mock");

check("source: environment", sourceOf("x", "y"), "environment");
check("source: database", sourceOf(undefined, "y"), "database");
check("source: database when the environment is blank", sourceOf("", "y"), "database");
check("source: unset", sourceOf(undefined, null), "unset");
check("source: unset when both are blank", sourceOf("  ", "  "), "unset");

// A pinned value must report as pinned even when a stored one exists, or the
// page tells an administrator their typing took effect when it did not.
check("a stored value under a pinned key still reports environment", sourceOf("env", "db"), "environment");

// -----------------------------------------------------------------------------
// Masking
// -----------------------------------------------------------------------------

check("a long secret shows its last four", maskSecret("sk_live_abcdefghij4821"), "••••••••4821");
check(
  "a short secret shows nothing at all",
  maskSecret("abc123"),
  "••••••••",
);
check("an eleven-character secret is still too short to hint at", maskSecret("12345678901"), "••••••••");
check("a twelve-character secret may show four", maskSecret("123456789012"), "••••••••9012");
check("an empty secret masks to nothing", maskSecret(""), "");
check("whitespace masks to nothing", maskSecret("   "), "");
check("a padded secret is trimmed before masking", maskSecret("  sk_live_abcdefghij4821  "), "••••••••4821");

// -----------------------------------------------------------------------------
// Booleans
// -----------------------------------------------------------------------------

check("true", asBoolean("true", false), true);
check("1", asBoolean("1", false), true);
check("yes", asBoolean("yes", false), true);
check("on — what a checkbox posts", asBoolean("on", false), true);
check("TRUE regardless of case", asBoolean("TRUE", false), true);
check("false", asBoolean("false", true), false);
check("0", asBoolean("0", true), false);
check("anything unrecognised is false, not the fallback", asBoolean("maybe", true), false);
check("empty takes the fallback", asBoolean("", true), true);
check("whitespace takes the fallback", asBoolean("  ", true), true);

// -----------------------------------------------------------------------------
// Providers
// -----------------------------------------------------------------------------

const sms = integrationById("sms")!;
const payments = integrationById("payments")!;
const push = integrationById("push")!;

ok("arkesel is a provider the dispatcher knows", isKnownProvider(sms, "arkesel"));
ok("mock is a provider the dispatcher knows", isKnownProvider(sms, "mock"));
ok("a typo is not", !isKnownProvider(sms, "arkessel"));
ok("an empty provider is not", !isKnownProvider(sms, ""));
// Push has no provider choice at all, so nothing about it can be unknown.
ok("an integration with no provider list accepts anything", isKnownProvider(push, ""));

check("a known provider gets its label", providerLabel(sms, "mnotify"), "mNotify");
check("an unknown provider is shown as typed", providerLabel(sms, "nonsense"), "nonsense");

// --- Provider precedence ------------------------------------------------------
//
// The rule that shipped broken. `.env.example` sets PAYMENT_PROVIDER=mock, so
// every school that copied it had the provider selector pinned read-only on
// the page whose whole purpose is to choose a provider.

check(
  "the fallback provider in the environment does not pin the selector",
  resolveProvider(payments, "mock", null),
  { value: "mock", source: "unset" },
);
check(
  "a stored provider beats the fallback in the environment",
  resolveProvider(payments, "mock", "paystack"),
  { value: "paystack", source: "database" },
);
check(
  "a real provider in the environment does pin it",
  resolveProvider(payments, "paystack", "hubtel"),
  { value: "paystack", source: "environment" },
);
check(
  "case and padding in the environment do not defeat the rule",
  resolveProvider(payments, "  MOCK  ", "paystack"),
  { value: "paystack", source: "database" },
);
check(
  "nothing anywhere resolves to the fallback, still unpinned",
  resolveProvider(payments, undefined, null),
  { value: "mock", source: "unset" },
);
check(
  "storage uses its own fallback, not mock",
  resolveProvider(integrationById("storage")!, "local", null),
  { value: "local", source: "unset" },
);
check(
  "a real storage driver in the environment pins it",
  resolveProvider(integrationById("storage")!, "s3", null),
  { value: "s3", source: "environment" },
);
// An unrecognised name must still be reported as coming from the environment,
// so the page can say "this is what your deployment set, and it is wrong"
// rather than quietly showing the fallback.
check(
  "a typo in the environment is still pinned, so it can be reported",
  resolveProvider(payments, "paystakc", null),
  { value: "paystakc", source: "environment" },
);

ok(
  "every integration with a provider list names its fallback",
  INTEGRATIONS.every(
    (integration) =>
      integration.providers.length === 0 ||
      (Boolean(integration.fallbackProvider) &&
        integration.providers.some(
          (provider) => provider.value === integration.fallbackProvider,
        )),
  ),
);

// -----------------------------------------------------------------------------
// Fields
// -----------------------------------------------------------------------------

const arkeselFields = fieldsFor(sms, "arkesel").map((field) => field.key);
check("arkesel asks only for its own key", arkeselFields, ["ARKESEL_API_KEY"]);

const hubtelSmsFields = fieldsFor(sms, "hubtel").map((field) => field.key);
check("hubtel SMS asks for both halves", hubtelSmsFields, [
  "HUBTEL_SMS_CLIENT_ID",
  "HUBTEL_SMS_CLIENT_SECRET",
]);

check("the mock provider asks for nothing", fieldsFor(sms, "mock").length, 0);

// The two Hubtel integrations must not share credentials: the SMS product and
// the payments product issue different client IDs, and a form that offered one
// for both would look right and fail at the first send.
const hubtelPayFields = fieldsFor(payments, "hubtel").map((field) => field.key);
ok(
  "hubtel payments and hubtel SMS use different credentials",
  hubtelPayFields.every((key) => !hubtelSmsFields.includes(key)),
);

check("a field with no provider restriction is always shown", fieldsFor(push, "").length, 3);

// -----------------------------------------------------------------------------
// The catalogue as a whole
// -----------------------------------------------------------------------------

const keys = allIntegrationKeys();
check("no key appears twice", keys.length, new Set(keys).size);
ok("every key is an environment-variable name", keys.every((key) => /^[A-Z][A-Z0-9_]*$/.test(key)));

ok(
  "every field is reachable through fieldByKey",
  INTEGRATIONS.every((integration) =>
    integration.fields.every((field) => fieldByKey(field.key)?.key === field.key),
  ),
);

ok(
  "every integration with a provider list has a provider key",
  INTEGRATIONS.every(
    (integration) => integration.providers.length === 0 || Boolean(integration.providerKey),
  ),
);

ok(
  "every onlyFor names a provider that exists",
  INTEGRATIONS.every((integration) =>
    integration.fields.every(
      (field) =>
        !field.onlyFor ||
        field.onlyFor.every((value) =>
          integration.providers.some((provider) => provider.value === value),
        ),
    ),
  ),
);

// A secret that is not marked as one is rendered in full on the settings page
// and written to the database in plaintext. Both are silent.
const SHOULD_BE_SECRET = /(_KEY|_SECRET|_PASSWORD)$/;
const wronglyPlain = INTEGRATIONS.flatMap((integration) => integration.fields).filter(
  (field) =>
    SHOULD_BE_SECRET.test(field.key) &&
    field.kind !== "secret" &&
    // Public keys are published to the browser by design.
    !field.key.includes("PUBLIC"),
);
check("every credential-shaped field is marked secret", wronglyPlain.map((f) => f.key), []);

ok(
  "storage is the only deployment-only integration",
  INTEGRATIONS.filter((integration) => integration.envOnly).map((i) => i.id).join() ===
    "storage",
);

ok(
  "every deployment-only integration says why",
  INTEGRATIONS.every((integration) => !integration.envOnly || Boolean(integration.envOnlyReason)),
);

// -----------------------------------------------------------------------------
// Encryption
// -----------------------------------------------------------------------------

process.env.CREDENTIALS_KEY = "a-test-key-that-is-long-enough-to-be-real-32";
resetKeyCache();

const plain = "sk_live_0123456789abcdef";
const encrypted = encryptSecret(plain);

check("a secret round-trips", decryptSecret(encrypted), plain);
ok("the ciphertext does not contain the secret", !encrypted.includes(plain));
ok("the ciphertext is versioned", encrypted.startsWith("v1."));

// Two encryptions of the same value must differ, or a database dump reveals
// which schools share a provider key.
ok("encrypting twice gives different ciphertext", encryptSecret(plain) !== encryptSecret(plain));

check("Twi and cedi characters survive", decryptSecret(encryptSecret("ɛɔ₵ ok")), "ɛɔ₵ ok");
check("an empty string round-trips", decryptSecret(encryptSecret("")), "");

// Authenticated encryption: a tampered ciphertext must fail, not decrypt to
// something plausible.
const parts = encrypted.split(".");
const tamperedBody = [parts[0], parts[1], parts[2], Buffer.from("nonsense").toString("base64url")].join(".");
check("a tampered payload does not decrypt", decryptSecret(tamperedBody), null);
check("a truncated value does not decrypt", decryptSecret("v1.abc"), null);
check("an unversioned value does not decrypt", decryptSecret("just-a-plain-string"), null);
check("an empty stored value does not decrypt", decryptSecret(""), null);

// A rotated master key must fail closed rather than return rubbish.
process.env.CREDENTIALS_KEY = "a-completely-different-key-also-long-enough";
resetKeyCache();
check("a rotated key cannot read the old ciphertext", decryptSecret(encrypted), null);

// -----------------------------------------------------------------------------

if (failures.length) {
  console.error(`\n  ${failures.length} failed:\n`);
  for (const failure of failures) console.error(`    ✗ ${failure}\n`);
  process.exit(1);
}

console.log(`  ok  ${passed} integration checks passed.`);
