-- Lesson notes: the weekly preparation a teacher writes and the head vets.

CREATE TYPE "LessonNoteStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED');

CREATE TABLE "LessonNote" (
  "id"               TEXT NOT NULL,
  "offeringId"       TEXT NOT NULL,
  "weekNumber"       INTEGER NOT NULL,
  "weekEnding"       TIMESTAMP(3) NOT NULL,
  "topic"            TEXT NOT NULL,
  "subTopic"         TEXT,
  "objectives"       TEXT[] DEFAULT ARRAY[]::TEXT[],
  "rpk"              TEXT,
  "materials"        TEXT[] DEFAULT ARRAY[]::TEXT[],
  "coreCompetencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "introduction"     TEXT,
  "development"      TEXT,
  "closure"          TEXT,
  "evaluation"       TEXT,
  "homework"         TEXT,
  "reflection"       TEXT,
  "periodsPlanned"   INTEGER NOT NULL DEFAULT 0,
  "status"           "LessonNoteStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt"      TIMESTAMP(3),
  "vettedById"       TEXT,
  "vettedAt"         TIMESTAMP(3),
  "vetterRemarks"    TEXT,
  "createdById"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessonNote_pkey" PRIMARY KEY ("id")
);

-- One note per subject per class per week.
--
-- Two notes for the same week is two teachers each believing theirs is the one
-- that was vetted, and a head who approved one of them with no way to tell
-- which. It is the whole point of the record that there is exactly one.
CREATE UNIQUE INDEX "LessonNote_offeringId_weekNumber_key"
  ON "LessonNote" ("offeringId", "weekNumber");

CREATE INDEX "LessonNote_status_idx" ON "LessonNote" ("status");
CREATE INDEX "LessonNote_weekEnding_idx" ON "LessonNote" ("weekEnding");

ALTER TABLE "LessonNote"
  ADD CONSTRAINT "LessonNote_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "SubjectOffering" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LessonNote"
  ADD CONSTRAINT "LessonNote_vettedById_fkey"
  FOREIGN KEY ("vettedById") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A term has weeks; week zero and week ninety are typing slips that would file
-- a note where nobody looks for it.
ALTER TABLE "LessonNote"
  ADD CONSTRAINT "LessonNote_week_in_range"
  CHECK ("weekNumber" >= 1 AND "weekNumber" <= 20);

ALTER TABLE "LessonNote"
  ADD CONSTRAINT "LessonNote_periods_sane"
  CHECK ("periodsPlanned" >= 0 AND "periodsPlanned" <= 50);

-- A note is submitted, or it is not.
--
-- Approved and returned both mean somebody handed it in, so both carry the
-- date they did. Without this a note can be approved with no record of it ever
-- having been submitted, which is precisely the gap an inspection asks about.
ALTER TABLE "LessonNote"
  ADD CONSTRAINT "LessonNote_submitted_when_handed_in"
  CHECK (("status" = 'DRAFT' AND "submittedAt" IS NULL)
      OR ("status" <> 'DRAFT' AND "submittedAt" IS NOT NULL));

-- Vetted means somebody vetted it, and vetting has a date and a person.
--
-- A note marked approved with no vetter is a note nobody is answerable for.
-- The whole value of the record to a head teacher is that their name is on it.
ALTER TABLE "LessonNote"
  ADD CONSTRAINT "LessonNote_vetting_complete"
  CHECK (("status" IN ('DRAFT', 'SUBMITTED') AND "vettedAt" IS NULL AND "vettedById" IS NULL)
      OR ("status" IN ('APPROVED', 'RETURNED') AND "vettedAt" IS NOT NULL AND "vettedById" IS NOT NULL));

-- A note sent back says why.
--
-- Returned with no remarks is a teacher guessing at what to change, which is
-- how a note goes round three times.
ALTER TABLE "LessonNote"
  ADD CONSTRAINT "LessonNote_returned_with_a_reason"
  CHECK ("status" <> 'RETURNED'
      OR ("vetterRemarks" IS NOT NULL AND length(btrim("vetterRemarks")) > 0));

-- A topic is the one thing a note cannot be without: it is what the week is
-- about, and it is the column an inspection reads down.
ALTER TABLE "LessonNote"
  ADD CONSTRAINT "LessonNote_has_a_topic"
  CHECK (length(btrim("topic")) > 0);
