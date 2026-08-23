/**
 * Central environment access. Everything that reads `process.env` should go
 * through here so misconfiguration surfaces in one place rather than as a
 * mystery `undefined` deep inside a provider.
 */

function str(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

function bool(key: string, fallback = false): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function int(key: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * A single variable, by name, exactly as the deployment set it.
 *
 * The integration resolver needs to know per key whether the environment
 * carries a value at all — not what the value falls back to — so it can say
 * "this one is pinned by the deployment" and leave it alone. Reading
 * `process.env` there instead would put a second reader of the environment in
 * the codebase, which is the thing this file exists to prevent.
 */
export function rawEnv(key: string): string {
  return process.env[key]?.trim() ?? "";
}

export const env = {
  nodeEnv: str("NODE_ENV", "development"),
  isProduction: str("NODE_ENV") === "production",

  appUrl: str("APP_URL", str("NEXT_PUBLIC_APP_URL", "http://localhost:3000")).replace(/\/$/, ""),
  databaseUrl: str("DATABASE_URL"),

  sessionSecret: str("SESSION_SECRET", "development-only-insecure-secret-change-me"),
  sessionTtlDays: int("SESSION_TTL_DAYS", 7),

  /*
   * CREDENTIALS_KEY encrypts provider credentials stored in the database. It
   * is read live by src/lib/integrations/secrets.ts rather than snapshotted
   * here — a deployment that populates its secrets after the process starts
   * would otherwise encrypt with the fallback and never know. It is optional:
   * without it SESSION_SECRET is used, which every deployment already has.
   * Set it separately only when the two need different rotation schedules —
   * rotating the session secret signs everyone out, while rotating this one
   * makes every stored credential unreadable.
   */

  /**
   * Deployment defaults for two things that are preferences rather than
   * credentials: the name a parent sees an SMS come from, and the address
   * email is sent as. Both are overridden by Messaging preferences in the
   * settings screen, which is the only place a school changes them.
   *
   * They sit apart from the provider credentials on purpose — see below.
   */
  messaging: {
    senderId: str("SMS_SENDER_ID", "SCHOOL"),
    emailFrom: str("EMAIL_FROM", "School Admin <noreply@school.edu.gh>"),
  },

  /*
   * Provider credentials — payments, SMS, email, push and AI — are deliberately
   * NOT here.
   *
   * They used to be, and every sender read them straight from this object. The
   * trouble is that a credential now has two possible homes: the environment,
   * and the encrypted table a school fills in from the settings screen. An
   * accessor on this object can only ever answer for one of them, so any code
   * reading `env.sms.arkeselKey` would be reading half the answer and would
   * look completely correct doing it.
   *
   * They live in `src/lib/integrations/config.ts` instead, which resolves the
   * two sources against each other in one place, and
   * `scripts/check-integration-reads.mjs` fails the build if anything starts
   * reading them from the environment again.
   *
   * Storage stays below because it is the one integration that is still
   * environment-only: changing where files are kept does not redirect them, it
   * orphans everything already stored.
   */

  storage: {
    driver: str("STORAGE_DRIVER", "local").toLowerCase(),
    localDir: str("STORAGE_LOCAL_DIR", "./storage/uploads"),
    s3Endpoint: str("S3_ENDPOINT"),
    s3Region: str("S3_REGION", "auto"),
    s3Bucket: str("S3_BUCKET"),
    s3AccessKeyId: str("S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: str("S3_SECRET_ACCESS_KEY"),
  },

  cronSecret: str("CRON_SECRET"),

  seed: {
    adminEmail: str("SEED_ADMIN_EMAIL", "admin@school.edu.gh"),
    adminPassword: str("SEED_ADMIN_PASSWORD", "ChangeMe123!"),
  },
};

/**
 * Fails fast at boot in production if something essential is missing.
 * Called from instrumentation so a misdeployed instance is obvious.
 */
export function assertProductionEnv(): string[] {
  const problems: string[] = [];
  if (!env.databaseUrl) problems.push("DATABASE_URL is not set");
  if (env.sessionSecret.length < 32) {
    problems.push("SESSION_SECRET must be at least 32 characters");
  }
  if (env.isProduction && env.sessionSecret.startsWith("development-only")) {
    problems.push("SESSION_SECRET is still the development placeholder");
  }
  return problems;
}
