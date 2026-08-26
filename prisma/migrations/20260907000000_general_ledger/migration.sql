-- The general ledger: double entry underneath everything that touches money.
--
-- The fee ledger already knew what a family owed and the expenditure module
-- already knew what a bill cost. Neither could answer the question an auditor
-- actually asks, which is "show me the trial balance". This is that layer. It
-- replaces neither of them; it records what they did in the form an accountant
-- reads.
--
-- Two rules run through the whole of it. An entry balances or it is not an
-- entry. And a posted entry is never edited or deleted, because a ledger that
-- can be rewritten is a statement of opinion rather than a record.

CREATE TYPE "LedgerAccountType" AS ENUM (
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE'
);

CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

CREATE TABLE "LedgerAccount" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "type"        "LedgerAccountType" NOT NULL,
  "parentId"    TEXT,
  "description" TEXT,
  "isSystem"    BOOLEAN NOT NULL DEFAULT false,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");
CREATE INDEX "LedgerAccount_type_idx" ON "LedgerAccount"("type");
CREATE INDEX "LedgerAccount_isActive_idx" ON "LedgerAccount"("isActive");

CREATE TABLE "JournalEntry" (
  "id"             TEXT NOT NULL,
  "reference"      TEXT NOT NULL,
  "entryDate"      TIMESTAMP(3) NOT NULL,
  "narration"      TEXT NOT NULL,
  "status"         "JournalStatus" NOT NULL DEFAULT 'DRAFT',
  "source"         TEXT NOT NULL DEFAULT 'manual',
  "sourceId"       TEXT,
  "academicYearId" TEXT,
  "termId"         TEXT,
  "reversesId"     TEXT,
  "postedAt"       TIMESTAMP(3),
  "postedById"     TEXT,
  "postedByLabel"  TEXT,
  "createdById"    TEXT,
  "createdByLabel" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JournalEntry_reference_key" ON "JournalEntry"("reference");
-- One reversal per entry. Reversing the same entry twice would take the
-- accounts past where they started and leave nothing to say which correction
-- was the real one.
CREATE UNIQUE INDEX "JournalEntry_reversesId_key" ON "JournalEntry"("reversesId");
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");
CREATE INDEX "JournalEntry_status_idx" ON "JournalEntry"("status");
CREATE INDEX "JournalEntry_source_sourceId_idx" ON "JournalEntry"("source", "sourceId");
CREATE INDEX "JournalEntry_academicYearId_idx" ON "JournalEntry"("academicYearId");

CREATE TABLE "JournalLine" (
  "id"          TEXT NOT NULL,
  "entryId"     TEXT NOT NULL,
  "accountId"   TEXT NOT NULL,
  "debitMinor"  INTEGER NOT NULL DEFAULT 0,
  "creditMinor" INTEGER NOT NULL DEFAULT 0,
  "memo"        TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- A line is a debit or a credit, never both and never negative.
--
-- A negative debit is a credit written the wrong way round: it makes every
-- total ambiguous and hides a sign error inside an entry that still adds up.
-- A row that is both at once could be read one way by the trial balance and
-- the other by the screen. Prisma cannot express either rule, so the database
-- enforces them and no code path can get round it.
ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_one_side_only" CHECK (
    "debitMinor" >= 0
    AND "creditMinor" >= 0
    AND NOT ("debitMinor" > 0 AND "creditMinor" > 0)
  );

-- ---------------------------------------------------------------------------
-- References
--
-- An account cannot be deleted while anything has ever been posted to it
-- (RESTRICT): the entry would lose the only thing that says what it was for,
-- and a ledger with an orphaned line no longer balances by type. Lines cascade
-- with their entry, because half an entry is not a shorter entry, it is an
-- unbalanced one.

ALTER TABLE "LedgerAccount"
  ADD CONSTRAINT "LedgerAccount_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_termId_fkey"
  FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_reversesId_fkey"
  FOREIGN KEY ("reversesId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
