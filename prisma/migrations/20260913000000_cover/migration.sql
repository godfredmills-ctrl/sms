-- Cover: who stands in front of a class when the teacher is not there.
--
-- Nothing here records who is absent. The leave table already does, and a
-- second copy is a copy that stops agreeing the first time somebody comes back
-- early. A row in this table is a decision about one period on one morning.

CREATE TYPE "CoverKind" AS ENUM ('TEACHER', 'SUPERVISED', 'MERGED', 'CANCELLED');

-- The pair a cover row points at.
--
-- id is already unique on its own, so this index buys no uniqueness. It exists
-- so the foreign key below can carry dayOfWeek along with the slot, which is
-- what makes the weekday CHECK on the cover row mean anything: without it the
-- denormalised column is just a number somebody could set to 4 on a Tuesday.
CREATE UNIQUE INDEX "TimetableSlot_id_dayOfWeek_key"
  ON "TimetableSlot" ("id", "dayOfWeek");

CREATE TABLE "CoverAssignment" (
  "id"            TEXT NOT NULL,
  "date"          DATE NOT NULL,
  "dayOfWeek"     INTEGER NOT NULL,
  "slotId"        TEXT NOT NULL,
  "absentStaffId" TEXT NOT NULL,
  "kind"          "CoverKind" NOT NULL DEFAULT 'TEACHER',
  "coverStaffId"  TEXT,
  "note"          TEXT,
  "arrangedById"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoverAssignment_pkey" PRIMARY KEY ("id")
);

-- One decision per period per day.
--
-- Two rows is two teachers each told the class was theirs, and each assuming
-- the other went. That is the one outcome worse than nobody being sent.
CREATE UNIQUE INDEX "CoverAssignment_slotId_date_key"
  ON "CoverAssignment" ("slotId", "date");

CREATE INDEX "CoverAssignment_date_idx" ON "CoverAssignment" ("date");
CREATE INDEX "CoverAssignment_coverStaffId_date_idx"
  ON "CoverAssignment" ("coverStaffId", "date");
CREATE INDEX "CoverAssignment_absentStaffId_date_idx"
  ON "CoverAssignment" ("absentStaffId", "date");

ALTER TABLE "CoverAssignment"
  ADD CONSTRAINT "CoverAssignment_slotId_dayOfWeek_fkey"
  FOREIGN KEY ("slotId", "dayOfWeek") REFERENCES "TimetableSlot" ("id", "dayOfWeek")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoverAssignment"
  ADD CONSTRAINT "CoverAssignment_absentStaffId_fkey"
  FOREIGN KEY ("absentStaffId") REFERENCES "Staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoverAssignment"
  ADD CONSTRAINT "CoverAssignment_coverStaffId_fkey"
  FOREIGN KEY ("coverStaffId") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CoverAssignment"
  ADD CONSTRAINT "CoverAssignment_arrangedById_fkey"
  FOREIGN KEY ("arrangedById") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The date has to be the day the period falls on.
--
-- With the composite foreign key above, dayOfWeek is the slot's own weekday,
-- so this is the whole rule: cover for a Wednesday period is arranged on a
-- Wednesday. It is the mistake that gets made when somebody changes the date
-- at the top of the screen and then clicks a row that was listed for the day
-- before, and it is invisible afterwards because both rows look reasonable.
--
-- ISODOW gives 1 for Monday through 7 for Sunday, which is what dayOfWeek
-- means everywhere else in this schema.
ALTER TABLE "CoverAssignment"
  ADD CONSTRAINT "CoverAssignment_date_is_that_weekday"
  CHECK (EXTRACT(ISODOW FROM "date")::INTEGER = "dayOfWeek");

-- Somebody is covering, or the period is lost. Not both, and not neither.
--
-- A row with a kind of TEACHER and nobody named is a period the board reports
-- as arranged and nobody walks into.
ALTER TABLE "CoverAssignment"
  ADD CONSTRAINT "CoverAssignment_cover_matches_kind"
  CHECK (("kind" = 'CANCELLED' AND "coverStaffId" IS NULL)
      OR ("kind" <> 'CANCELLED' AND "coverStaffId" IS NOT NULL));

-- Nobody covers for themselves.
--
-- It reads like a joke until you watch somebody pick a name from a list of
-- thirty on a Monday morning. The row it produces is the worst kind: it
-- satisfies every count on the board and leaves the class empty.
ALTER TABLE "CoverAssignment"
  ADD CONSTRAINT "CoverAssignment_not_covering_yourself"
  CHECK ("coverStaffId" IS NULL OR "coverStaffId" <> "absentStaffId");

-- A lost period says why.
--
-- Cancelling is allowed; cancelling silently is not. The note is what makes a
-- term of lost periods answerable rather than merely regrettable.
ALTER TABLE "CoverAssignment"
  ADD CONSTRAINT "CoverAssignment_lost_period_has_a_reason"
  CHECK ("kind" <> 'CANCELLED'
      OR ("note" IS NOT NULL AND length(btrim("note")) > 0));
