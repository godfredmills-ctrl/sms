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

export const env = {
  nodeEnv: str("NODE_ENV", "development"),
  isProduction: str("NODE_ENV") === "production",

  appUrl: str("APP_URL", str("NEXT_PUBLIC_APP_URL", "http://localhost:3000")).replace(/\/$/, ""),
  databaseUrl: str("DATABASE_URL"),

  sessionSecret: str("SESSION_SECRET", "development-only-insecure-secret-change-me"),
  sessionTtlDays: int("SESSION_TTL_DAYS", 7),

  ai: {
    enabled: bool("AI_ENABLED", true) && Boolean(str("ANTHROPIC_API_KEY")),
    apiKey: str("ANTHROPIC_API_KEY"),
    // Must match the documented default in .env.example and the README —
    // setting only the API key should give the model those files promise.
    model: str("ANTHROPIC_MODEL", "claude-opus-5"),
  },

  payments: {
    provider: str("PAYMENT_PROVIDER", "mock").toLowerCase(),
    paystackSecret: str("PAYSTACK_SECRET_KEY"),
    paystackPublic: str("PAYSTACK_PUBLIC_KEY"),
    hubtelClientId: str("HUBTEL_CLIENT_ID"),
    hubtelClientSecret: str("HUBTEL_CLIENT_SECRET"),
    hubtelMerchant: str("HUBTEL_MERCHANT_ACCOUNT"),
  },

  sms: {
    provider: str("SMS_PROVIDER", "mock").toLowerCase(),
    senderId: str("SMS_SENDER_ID", "SCHOOL"),
    arkeselKey: str("ARKESEL_API_KEY"),
    mnotifyKey: str("MNOTIFY_API_KEY"),
    hubtelClientId: str("HUBTEL_SMS_CLIENT_ID"),
    hubtelClientSecret: str("HUBTEL_SMS_CLIENT_SECRET"),
  },

  email: {
    provider: str("EMAIL_PROVIDER", "mock").toLowerCase(),
    from: str("EMAIL_FROM", "School Admin <noreply@school.edu.gh>"),
    host: str("SMTP_HOST"),
    port: int("SMTP_PORT", 587),
    secure: bool("SMTP_SECURE", false),
    user: str("SMTP_USER"),
    password: str("SMTP_PASSWORD"),
  },

  push: {
    publicKey: str("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    privateKey: str("VAPID_PRIVATE_KEY"),
    subject: str("VAPID_SUBJECT", "mailto:admin@school.edu.gh"),
    get enabled() {
      return Boolean(str("NEXT_PUBLIC_VAPID_PUBLIC_KEY") && str("VAPID_PRIVATE_KEY"));
    },
  },

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
