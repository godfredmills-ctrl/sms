-- Provider credentials a school can set without a redeploy.
--
-- Until now every integration key lived only in the deployment's environment,
-- which meant exactly one person could configure the system — whoever holds
-- the hosting dashboard — and every change was a redeploy. That is the right
-- arrangement for a school with an IT department and the wrong one for a
-- school where the bursar signs up with an SMS aggregator on a Tuesday
-- afternoon and wants reminders going out that evening.
--
-- Secrets are stored encrypted (AES-256-GCM, key derived from CREDENTIALS_KEY
-- or SESSION_SECRET), so a database dump is ciphertext and the key that opens
-- it is never in the database. Non-secret values — a chosen provider, an SMTP
-- host — are plaintext, because encrypting them would buy nothing and would
-- make the column useless to an operator with a psql prompt and a real
-- problem.
--
-- The environment still wins wherever it sets the same key, so no existing
-- deployment changes behaviour when this table appears empty, and an operator
-- who pins a key in the hosting dashboard keeps it pinned.

CREATE TABLE "IntegrationSetting" (
  "id"             TEXT NOT NULL,
  "key"            TEXT NOT NULL,
  "value"          TEXT NOT NULL,
  "isSecret"       BOOLEAN NOT NULL DEFAULT false,
  "updatedById"    TEXT,
  "updatedByLabel" TEXT,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("id")
);

-- One row per environment variable name. The resolver reads the whole table at
-- once and looks up by key, so the unique index is both the constraint and the
-- only index it needs.
CREATE UNIQUE INDEX "IntegrationSetting_key_key" ON "IntegrationSetting"("key");
