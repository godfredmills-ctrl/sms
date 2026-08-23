import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

import { env, rawEnv } from "@/lib/env";

/**
 * Encryption for provider credentials held in the database.
 *
 * `settings.ts` states the rule this module bends, and it is worth restating
 * rather than quietly contradicting: an API key stored in a table is readable
 * by anyone with a database session, survives in every backup, and leaks
 * through an ordinary SQL injection. All three of those remain true of
 * *plaintext* in a table, and all three are the reason nothing here is stored
 * as plaintext.
 *
 * What changed is who has to be able to configure the system. A key held only
 * in the deployment's environment can be set by exactly one person — whoever
 * has the hosting dashboard — and changing it means a redeploy. That is the
 * right arrangement for a school with an IT department and the wrong one for
 * a school where the bursar signs up with Arkesel on a Tuesday afternoon. So:
 * the environment still wins wherever it is set, and where it is not, the
 * value may be stored here, encrypted, with the key that opens it held in the
 * environment and never in the database. A dump of the database is ciphertext.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than producing a plausible-looking wrong key.
 */

const FORMAT = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

/**
 * Domain separation, not secrecy — the master secret is already high-entropy
 * random, so a per-value salt would buy nothing and cost an scrypt derivation
 * on every read. Constant, so the key can be derived once per process.
 */
const SALT = "sms.integration-secrets.v1";

let cachedKey: Buffer | null = null;

/**
 * The master secret. A dedicated variable if one is set, otherwise the session
 * secret, which every deployment already has and already guards.
 *
 * Rotating it makes every stored credential unreadable. That is stated plainly
 * on the settings screen rather than discovered when the fee reminders stop.
 */
function masterSecret(): string {
  // Read live rather than from the snapshot `env` takes at import. A
  // deployment that populates its secrets after the process starts — a runtime
  // secret loader, a sidecar — would otherwise be encrypting with the fallback
  // and never know, and rotation could not be tested at all.
  return rawEnv("CREDENTIALS_KEY") || env.sessionSecret;
}

export function hasMasterSecret(): boolean {
  const secret = masterSecret();
  return Boolean(secret) && !secret.startsWith("development-only");
}

function key(): Buffer {
  cachedKey ??= scryptSync(masterSecret(), SALT, 32);
  return cachedKey;
}

/** Only for tests, which need a fresh derivation after changing the secret. */
export function resetKeyCache(): void {
  cachedKey = null;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    FORMAT,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/**
 * Returns null when the value cannot be read — a rotated master secret, a
 * truncated column, a row copied between deployments.
 *
 * Null is never treated as "not configured". A credential that exists and
 * cannot be decrypted is a fault to report, not an empty field to fall back
 * from, and the caller is expected to say so: a school whose SMS silently
 * reverted to the mock provider would go on being told 412 reminders were
 * sent.
 */
export function decryptSecret(stored: string): string | null {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== FORMAT) return null;

  try {
    const [, ivPart, tagPart, cipherPart] = parts;
    const decipher = createDecipheriv(
      ALGORITHM,
      key(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(cipherPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
