-- The alumni register.

CREATE TYPE "AlumniEngagement" AS ENUM (
  'DONATION', 'MENTORING', 'EVENT', 'SPEAKING', 'PLACEMENT', 'UPDATE', 'OTHER'
);

CREATE TABLE "Alumnus" (
  "id"               TEXT NOT NULL,
  "studentId"        TEXT,
  "title"            TEXT,
  "firstName"        TEXT NOT NULL,
  "lastName"         TEXT NOT NULL,
  "otherNames"       TEXT,
  "nameAtSchool"     TEXT,
  "gender"           "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
  "photoUrl"         TEXT,
  "graduationYear"   INTEGER NOT NULL,
  "finalClass"       TEXT,
  "completed"        BOOLEAN NOT NULL DEFAULT true,
  "email"            TEXT,
  "phone"            TEXT,
  "whatsapp"         TEXT,
  "address"          TEXT,
  "city"             TEXT,
  "country"          TEXT DEFAULT 'Ghana',
  "university"       TEXT,
  "course"           TEXT,
  "occupation"       TEXT,
  "employer"         TEXT,
  "jobTitle"         TEXT,
  "linkedinUrl"      TEXT,
  "achievements"     TEXT,
  "consentToContact" BOOLEAN NOT NULL DEFAULT false,
  "consentSource"    TEXT,
  "consentAt"        TIMESTAMP(3),
  "verifiedAt"       TIMESTAMP(3),
  "verifiedBy"       TEXT,
  "deceasedOn"       TIMESTAMP(3),
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Alumnus_pkey" PRIMARY KEY ("id")
);

-- One alumnus per pupil. Two rows for the same person is how a school posts
-- the same invitation twice and asks for a donation from somebody who already
-- gave, and it is invisible from either row.
CREATE UNIQUE INDEX "Alumnus_studentId_key" ON "Alumnus" ("studentId");
CREATE INDEX "Alumnus_graduationYear_idx" ON "Alumnus" ("graduationYear");
CREATE INDEX "Alumnus_lastName_firstName_idx" ON "Alumnus" ("lastName", "firstName");
CREATE INDEX "Alumnus_consentToContact_idx" ON "Alumnus" ("consentToContact");

ALTER TABLE "Alumnus"
  ADD CONSTRAINT "Alumnus_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A leaving year outside living memory is a typing slip, and it puts the person
-- in a cohort that will never hold a reunion.
ALTER TABLE "Alumnus"
  ADD CONSTRAINT "Alumnus_year_plausible"
  CHECK ("graduationYear" >= 1900 AND "graduationYear" <= 2200);

-- Consent and the date it was given move together.
--
-- Consent with no date cannot be evidenced, which under the Data Protection
-- Act 2012 is the same as not having it: the school has to be able to say when
-- and how somebody agreed, not merely that a box is ticked.
ALTER TABLE "Alumnus"
  ADD CONSTRAINT "Alumnus_consent_evidenced"
  CHECK (("consentToContact" = false)
      OR ("consentToContact" = true AND "consentAt" IS NOT NULL));

CREATE TABLE "AlumniEngagementRecord" (
  "id"          TEXT NOT NULL,
  "alumnusId"   TEXT NOT NULL,
  "kind"        "AlumniEngagement" NOT NULL,
  "happenedOn"  TIMESTAMP(3) NOT NULL,
  "summary"     TEXT NOT NULL,
  "detail"      TEXT,
  "amountMinor" INTEGER NOT NULL DEFAULT 0,
  "recordedBy"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlumniEngagementRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AlumniEngagementRecord_alumnusId_idx" ON "AlumniEngagementRecord" ("alumnusId");
CREATE INDEX "AlumniEngagementRecord_kind_happenedOn_idx" ON "AlumniEngagementRecord" ("kind", "happenedOn");

ALTER TABLE "AlumniEngagementRecord"
  ADD CONSTRAINT "AlumniEngagementRecord_alumnusId_fkey"
  FOREIGN KEY ("alumnusId") REFERENCES "Alumnus" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Money belongs to a donation and to nothing else.
--
-- An amount left on a mentoring record is added into the donations total by
-- the first report that forgets to filter by kind, and the figure that comes
-- out is wrong in a way nobody can trace back to a row.
ALTER TABLE "AlumniEngagementRecord"
  ADD CONSTRAINT "AlumniEngagementRecord_amount_only_on_donations"
  CHECK (("kind" = 'DONATION' AND "amountMinor" >= 0)
      OR ("kind" <> 'DONATION' AND "amountMinor" = 0));
