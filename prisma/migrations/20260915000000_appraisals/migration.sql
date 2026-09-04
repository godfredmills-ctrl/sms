-- Appraisal: the judgement, and the facts underneath it.

CREATE TYPE "AppraisalStatus" AS ENUM (
  'DRAFT', 'SELF_ASSESSED', 'APPRAISED', 'AGREED', 'DISPUTED'
);

CREATE TABLE "Appraisal" (
  "id"               TEXT NOT NULL,
  "staffId"          TEXT NOT NULL,
  "appraiserId"      TEXT NOT NULL,
  "academicYearId"   TEXT NOT NULL,
  "termId"           TEXT,
  "status"           "AppraisalStatus" NOT NULL DEFAULT 'DRAFT',
  "selfAssessment"   TEXT,
  "selfAssessedAt"   TIMESTAMP(3),
  "appraiserComment" TEXT,
  "appraisedAt"      TIMESTAMP(3),
  "response"         TEXT,
  "respondedAt"      TIMESTAMP(3),
  "evidence"         JSONB,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Appraisal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Appraisal_staffId_idx" ON "Appraisal" ("staffId");
CREATE INDEX "Appraisal_appraiserId_idx" ON "Appraisal" ("appraiserId");
CREATE INDEX "Appraisal_academicYearId_idx" ON "Appraisal" ("academicYearId");
CREATE INDEX "Appraisal_status_idx" ON "Appraisal" ("status");

-- One appraisal per person per period.
--
-- Two partial indexes rather than one plain unique, because termId is nullable
-- and NULL is not equal to itself: a plain UNIQUE (staffId, academicYearId,
-- termId) permits any number of whole-year appraisals for one person, which is
-- exactly the case a school runs. The first index covers the termly kind, the
-- second the annual, and between them a duplicate cannot be written.
CREATE UNIQUE INDEX "Appraisal_one_per_term"
  ON "Appraisal" ("staffId", "academicYearId", "termId")
  WHERE "termId" IS NOT NULL;

CREATE UNIQUE INDEX "Appraisal_one_per_year"
  ON "Appraisal" ("staffId", "academicYearId")
  WHERE "termId" IS NULL;

CREATE TABLE "AppraisalScore" (
  "id"          TEXT NOT NULL,
  "appraisalId" TEXT NOT NULL,
  "criterion"   TEXT NOT NULL,
  "rating"      INTEGER,
  "note"        TEXT,
  CONSTRAINT "AppraisalScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppraisalScore_appraisalId_criterion_key"
  ON "AppraisalScore" ("appraisalId", "criterion");
CREATE INDEX "AppraisalScore_appraisalId_idx" ON "AppraisalScore" ("appraisalId");

CREATE TABLE "AppraisalTarget" (
  "id"          TEXT NOT NULL,
  "appraisalId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "reviewBy"    TIMESTAMP(3),
  "met"         BOOLEAN,
  "sortKey"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppraisalTarget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppraisalTarget_appraisalId_idx" ON "AppraisalTarget" ("appraisalId");

ALTER TABLE "Appraisal"
  ADD CONSTRAINT "Appraisal_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT rather than SET NULL: an appraisal whose appraiser has left is
-- still an appraisal somebody signed, and blanking the name would leave a
-- rating on a personnel file that nobody is answerable for. A departing head
-- has their appraisals reassigned, deliberately, by a person.
ALTER TABLE "Appraisal"
  ADD CONSTRAINT "Appraisal_appraiserId_fkey"
  FOREIGN KEY ("appraiserId") REFERENCES "Staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Appraisal"
  ADD CONSTRAINT "Appraisal_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Appraisal"
  ADD CONSTRAINT "Appraisal_termId_fkey"
  FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppraisalScore"
  ADD CONSTRAINT "AppraisalScore_appraisalId_fkey"
  FOREIGN KEY ("appraisalId") REFERENCES "Appraisal" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppraisalTarget"
  ADD CONSTRAINT "AppraisalTarget_appraisalId_fkey"
  FOREIGN KEY ("appraisalId") REFERENCES "Appraisal" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nobody appraises themselves.
--
-- The whole of what the exercise is. A rating somebody gave themselves is not
-- a judgement, it is a statement, and there is already a field for those: the
-- self-assessment, which is above it and labelled as theirs.
ALTER TABLE "Appraisal"
  ADD CONSTRAINT "Appraisal_not_appraising_yourself"
  CHECK ("appraiserId" <> "staffId");

-- Rated means rated on the scale.
--
-- A zero or a five is a typing slip that would go straight into the average
-- and out again as a band, and nothing downstream would question it.
ALTER TABLE "AppraisalScore"
  ADD CONSTRAINT "AppraisalScore_rating_on_the_scale"
  CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 4));

-- An appraisal that has been written has a date and something written.
--
-- Anything past the self-assessment carries both: a status of APPRAISED with
-- no comment is a set of ratings nobody explained, which is the appraisal a
-- teacher cannot do anything with.
ALTER TABLE "Appraisal"
  ADD CONSTRAINT "Appraisal_appraised_has_a_comment"
  CHECK ("status" IN ('DRAFT', 'SELF_ASSESSED')
      OR ("appraisedAt" IS NOT NULL
          AND "appraiserComment" IS NOT NULL
          AND length(btrim("appraiserComment")) > 0));

-- Disagreement says what it disagrees with.
--
-- Being able to disagree is the point of the appraisee having a second turn.
-- A dispute with no words is a tick in a box that helps nobody, least of all
-- the person who ticked it.
ALTER TABLE "Appraisal"
  ADD CONSTRAINT "Appraisal_dispute_has_words"
  CHECK ("status" <> 'DISPUTED'
      OR ("response" IS NOT NULL AND length(btrim("response")) > 0));

-- A self-assessment that has been sent has a date on it.
ALTER TABLE "Appraisal"
  ADD CONSTRAINT "Appraisal_self_assessment_dated"
  CHECK ("selfAssessedAt" IS NULL OR "selfAssessment" IS NOT NULL);

-- A target somebody could not act on is not a target.
ALTER TABLE "AppraisalTarget"
  ADD CONSTRAINT "AppraisalTarget_has_a_description"
  CHECK (length(btrim("description")) >= 8);
