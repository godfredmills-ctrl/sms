import {
  createHash,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SCRYPT_PREFIX = "scrypt";

/**
 * Password hashing uses scrypt from Node's standard library — memory-hard,
 * no native build step, and available everywhere the app runs (including
 * Railway's slim images, where bcrypt/argon2 native builds are a liability).
 *
 * Stored format: `scrypt:<saltHex>:<hashHex>`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `${SCRYPT_PREFIX}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== SCRYPT_PREFIX || !saltHex || !hashHex) return false;

  try {
    const expected = Buffer.from(hashHex, "hex");
    const derived = await scrypt(
      password.normalize("NFKC"),
      Buffer.from(saltHex, "hex"),
      expected.length,
    );
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Opaque, URL-safe token for sessions, invites and verification links. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Tokens are stored hashed so a database leak cannot be replayed as a valid
 * session. SHA-256 is correct here (unlike for passwords) because the input
 * already has full entropy.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Numeric one-time code for phone/email verification. */
export function generateOtp(digits = 6): string {
  const max = 10 ** digits;
  return randomInt(0, max).toString().padStart(digits, "0");
}

/**
 * Human-friendly reference codes: receipt numbers, verification codes,
 * voter receipts. Excludes look-alike characters (0/O, 1/I/L).
 */
const READABLE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(length = 8): string {
  let out = "";
  const buf = randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    out += READABLE_ALPHABET[buf[i] % READABLE_ALPHABET.length];
  }
  return out;
}

/** Constant-time string comparison for secrets supplied by callers. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
