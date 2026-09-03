-- Timetabling: a real period grid, weekly period counts, and when staff cannot teach.

ALTER TABLE "SubjectOffering"
  ADD COLUMN "periodsPerWeek" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "doublePeriods"  INTEGER NOT NULL DEFAULT 0;

-- A week has a finite number of periods and a subject cannot want a negative
-- number of them. Fifty is well past any real timetable and is there to catch
-- a figure typed into the wrong box, not to express a policy.
ALTER TABLE "SubjectOffering"
  ADD CONSTRAINT "SubjectOffering_periods_sane"
  CHECK ("periodsPerWeek" >= 0 AND "periodsPerWeek" <= 50);

-- Doubles are counted in periods, not in pairs, and they come out of the
-- weekly total. Two doubles and a single is five periods a week, so a subject
-- claiming more doubles than it has periods is a slip that would otherwise
-- make the generator ask for time that was never allocated.
ALTER TABLE "SubjectOffering"
  ADD CONSTRAINT "SubjectOffering_doubles_within_periods"
  CHECK ("doublePeriods" >= 0 AND "doublePeriods" <= "periodsPerWeek");

-- Doubles are placed in pairs, so an odd number of them cannot be placed.
ALTER TABLE "SubjectOffering"
  ADD CONSTRAINT "SubjectOffering_doubles_even"
  CHECK ("doublePeriods" % 2 = 0);

CREATE TABLE "TimetablePeriod" (
  "id"          TEXT NOT NULL,
  "periodIndex" INTEGER NOT NULL,
  "startTime"   TEXT NOT NULL,
  "endTime"     TEXT NOT NULL,
  "isBreak"     BOOLEAN NOT NULL DEFAULT false,
  "label"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimetablePeriod_pkey" PRIMARY KEY ("id")
);

-- One row per position in the day. Two period 3s is a bell schedule with two
-- answers, and every screen that draws a timetable would pick a different one.
CREATE UNIQUE INDEX "TimetablePeriod_periodIndex_key" ON "TimetablePeriod" ("periodIndex");

ALTER TABLE "TimetablePeriod"
  ADD CONSTRAINT "TimetablePeriod_index_positive" CHECK ("periodIndex" >= 1);

-- Times are stored as "HH:MM" text because that is what the input gives, what
-- the screens print, and what sorts correctly as a string. The shape is
-- checked here so a malformed one cannot reach the clash arithmetic, which
-- treats anything it cannot parse as "not a clash" and would therefore go
-- quiet rather than complain.
ALTER TABLE "TimetablePeriod"
  ADD CONSTRAINT "TimetablePeriod_times_wellformed"
  CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     AND "endTime"   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- A period that ends before it starts is a period nothing can be placed in,
-- and it would silently overlap everything on the same day.
ALTER TABLE "TimetablePeriod"
  ADD CONSTRAINT "TimetablePeriod_ends_after_start"
  CHECK ("endTime" > "startTime");

CREATE TABLE "StaffUnavailability" (
  "id"          TEXT NOT NULL,
  "staffId"     TEXT NOT NULL,
  "dayOfWeek"   INTEGER NOT NULL,
  "periodIndex" INTEGER,
  "reason"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffUnavailability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffUnavailability_staffId_idx" ON "StaffUnavailability" ("staffId");
CREATE INDEX "StaffUnavailability_dayOfWeek_idx" ON "StaffUnavailability" ("dayOfWeek");

ALTER TABLE "StaffUnavailability"
  ADD CONSTRAINT "StaffUnavailability_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffUnavailability"
  ADD CONSTRAINT "StaffUnavailability_day_in_range"
  CHECK ("dayOfWeek" >= 1 AND "dayOfWeek" <= 7);

ALTER TABLE "StaffUnavailability"
  ADD CONSTRAINT "StaffUnavailability_period_positive"
  CHECK ("periodIndex" IS NULL OR "periodIndex" >= 1);

-- The same absence recorded twice is not an error the generator would notice,
-- and it is the sort of duplicate that accumulates on a screen where somebody
-- clicks twice. Partial, because a whole-day row has a NULL period and several
-- NULLs do not collide in a plain unique index.
CREATE UNIQUE INDEX "StaffUnavailability_one_per_period"
  ON "StaffUnavailability" ("staffId", "dayOfWeek", "periodIndex")
  WHERE "periodIndex" IS NOT NULL;
CREATE UNIQUE INDEX "StaffUnavailability_one_whole_day"
  ON "StaffUnavailability" ("staffId", "dayOfWeek")
  WHERE "periodIndex" IS NULL;

-- The default bell schedule, which is what the grid was hard-coded to before
-- it was data. A school changes these in Settings; seeding them means the
-- timetable screen is not empty on the first morning.
INSERT INTO "TimetablePeriod" ("id", "periodIndex", "startTime", "endTime", "isBreak", "label", "updatedAt") VALUES
  ('ttp_default_01',  1, '07:30', '08:10', false, NULL,      CURRENT_TIMESTAMP),
  ('ttp_default_02',  2, '08:10', '08:50', false, NULL,      CURRENT_TIMESTAMP),
  ('ttp_default_03',  3, '08:50', '09:30', false, NULL,      CURRENT_TIMESTAMP),
  ('ttp_default_04',  4, '09:30', '10:10', false, NULL,      CURRENT_TIMESTAMP),
  ('ttp_default_05',  5, '10:10', '10:40', true,  'Break',   CURRENT_TIMESTAMP),
  ('ttp_default_06',  6, '10:40', '11:20', false, NULL,      CURRENT_TIMESTAMP),
  ('ttp_default_07',  7, '11:20', '12:00', false, NULL,      CURRENT_TIMESTAMP),
  ('ttp_default_08',  8, '12:00', '12:40', false, NULL,      CURRENT_TIMESTAMP),
  ('ttp_default_09',  9, '12:40', '13:20', true,  'Lunch',   CURRENT_TIMESTAMP),
  ('ttp_default_10', 10, '13:20', '14:00', false, NULL,      CURRENT_TIMESTAMP),
  ('ttp_default_11', 11, '14:00', '14:40', false, NULL,      CURRENT_TIMESTAMP);
