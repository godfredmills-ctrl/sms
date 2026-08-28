-- Guardians can be deactivated.
--
-- Deactivating is not deleting. A parent stays on every child's record and on
-- every payment they made; what stops is contact. The three columns are the
-- flag, when it was set, and why, because "why" is the first thing the next
-- member of staff asks and nowhere else in the record answers it.

ALTER TABLE "Guardian"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deactivatedAt" TIMESTAMP(3),
  ADD COLUMN "deactivatedReason" TEXT;

-- A deactivated guardian has a date; an active one does not. Without this the
-- two halves drift: a screen reads the flag, an export reads the date, and
-- they disagree about the same person with neither raising an error.
ALTER TABLE "Guardian"
  ADD CONSTRAINT "Guardian_deactivated_consistent"
  CHECK (("isActive" = true AND "deactivatedAt" IS NULL)
      OR ("isActive" = false AND "deactivatedAt" IS NOT NULL));

-- The guardians list filters on this and nothing else in the table is
-- selective, so it is worth an index on a school with a few thousand families.
CREATE INDEX "Guardian_isActive_idx" ON "Guardian" ("isActive");
