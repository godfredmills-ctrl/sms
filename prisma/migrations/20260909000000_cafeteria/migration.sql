-- Cafeteria: meal plans, a cycle menu, and the serving register.

CREATE TYPE "MealSitting" AS ENUM ('BREAKFAST', 'BREAK', 'LUNCH', 'SUPPER');
CREATE TYPE "MealSubscriptionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ENDED');
CREATE TYPE "MealBasis" AS ENUM ('PLAN', 'CASH', 'STAFF', 'GUEST');

CREATE TABLE "MealPlan" (
  "id"           TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "description"  TEXT,
  "sittings"     "MealSitting"[],
  "priceMinor"   INTEGER NOT NULL DEFAULT 0,
  "perMealMinor" INTEGER NOT NULL DEFAULT 0,
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MealPlan_code_key" ON "MealPlan" ("code");
CREATE INDEX "MealPlan_isActive_idx" ON "MealPlan" ("isActive");

-- Money is never negative. A plan priced at minus twenty cedis would pay
-- families to eat, and would do it silently through the invoice run.
ALTER TABLE "MealPlan"
  ADD CONSTRAINT "MealPlan_prices_nonnegative"
  CHECK ("priceMinor" >= 0 AND "perMealMinor" >= 0);

-- A plan that covers no sittings is not a plan. It would sell, bill, and then
-- turn the child away at every counter.
ALTER TABLE "MealPlan"
  ADD CONSTRAINT "MealPlan_covers_something"
  CHECK (array_length("sittings", 1) >= 1);

CREATE TABLE "MealSubscription" (
  "id"           TEXT NOT NULL,
  "studentId"    TEXT NOT NULL,
  "planId"       TEXT NOT NULL,
  "termId"       TEXT NOT NULL,
  "status"       "MealSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsOn"     TIMESTAMP(3) NOT NULL,
  "endsOn"       TIMESTAMP(3),
  "chargedAt"    TIMESTAMP(3),
  "chargedMinor" INTEGER,
  "reason"       TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MealSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MealSubscription_studentId_termId_idx" ON "MealSubscription" ("studentId", "termId");
CREATE INDEX "MealSubscription_termId_status_idx" ON "MealSubscription" ("termId", "status");

ALTER TABLE "MealSubscription"
  ADD CONSTRAINT "MealSubscription_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealSubscription"
  ADD CONSTRAINT "MealSubscription_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "MealPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MealSubscription"
  ADD CONSTRAINT "MealSubscription_termId_fkey"
  FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One live plan per pupil per term, several in the history.
--
-- A pupil who moves from "Lunch only" to "Full board" in week three needs both
-- rows: the first is what the first three weeks were billed on. A plain unique
-- constraint would refuse the change; none at all would let a child hold two
-- live plans and be billed twice, which the serving screen would not show
-- because it reads the first row it finds. This is the shape Prisma cannot
-- express, which is exactly why it is written here.
CREATE UNIQUE INDEX "MealSubscription_one_active_per_term"
  ON "MealSubscription" ("studentId", "termId")
  WHERE "status" = 'ACTIVE';

-- Billed and the amount billed move together. A row with a date and no amount
-- cannot be reconciled; one with an amount and no date gets billed again on
-- the next run.
ALTER TABLE "MealSubscription"
  ADD CONSTRAINT "MealSubscription_charge_consistent"
  CHECK (("chargedAt" IS NULL AND "chargedMinor" IS NULL)
      OR ("chargedAt" IS NOT NULL AND "chargedMinor" IS NOT NULL AND "chargedMinor" >= 0));

-- A subscription that ends before it starts is a data-entry slip that would
-- otherwise show as a pupil entitled to nothing, with no error anywhere.
ALTER TABLE "MealSubscription"
  ADD CONSTRAINT "MealSubscription_dates_ordered"
  CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn");

CREATE TABLE "MealMenu" (
  "id"             TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "termId"         TEXT,
  "cycleWeeks"     INTEGER NOT NULL DEFAULT 2,
  "startsOn"       TIMESTAMP(3) NOT NULL,
  "isActive"       BOOLEAN NOT NULL DEFAULT false,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MealMenu_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MealMenu_academicYearId_termId_idx" ON "MealMenu" ("academicYearId", "termId");

ALTER TABLE "MealMenu"
  ADD CONSTRAINT "MealMenu_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealMenu"
  ADD CONSTRAINT "MealMenu_termId_fkey"
  FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A cycle of zero weeks divides by zero when working out which week today is.
ALTER TABLE "MealMenu"
  ADD CONSTRAINT "MealMenu_cycle_positive"
  CHECK ("cycleWeeks" >= 1 AND "cycleWeeks" <= 8);

-- One active menu at a time. Two would make "what is for lunch" a question
-- with two answers, and the serving screen would pick whichever sorted first.
CREATE UNIQUE INDEX "MealMenu_one_active"
  ON "MealMenu" (("isActive"))
  WHERE "isActive" = true;

CREATE TABLE "MealMenuItem" (
  "id"            TEXT NOT NULL,
  "menuId"        TEXT NOT NULL,
  "weekNumber"    INTEGER NOT NULL,
  "dayOfWeek"     INTEGER NOT NULL,
  "sitting"       "MealSitting" NOT NULL,
  "dish"          TEXT NOT NULL,
  "accompaniment" TEXT,
  "allergens"     TEXT[],
  "isVegetarian"  BOOLEAN NOT NULL DEFAULT false,
  "notes"         TEXT,
  CONSTRAINT "MealMenuItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MealMenuItem_menuId_weekNumber_dayOfWeek_sitting_key"
  ON "MealMenuItem" ("menuId", "weekNumber", "dayOfWeek", "sitting");
CREATE INDEX "MealMenuItem_menuId_idx" ON "MealMenuItem" ("menuId");

ALTER TABLE "MealMenuItem"
  ADD CONSTRAINT "MealMenuItem_menuId_fkey"
  FOREIGN KEY ("menuId") REFERENCES "MealMenu" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ISO days, and a week inside the rota. Week 3 of a two-week cycle is a dish
-- that is never cooked, and day 0 is a dish nobody ever sees.
ALTER TABLE "MealMenuItem"
  ADD CONSTRAINT "MealMenuItem_day_in_range"
  CHECK ("dayOfWeek" >= 1 AND "dayOfWeek" <= 7);
ALTER TABLE "MealMenuItem"
  ADD CONSTRAINT "MealMenuItem_week_positive"
  CHECK ("weekNumber" >= 1);

CREATE TABLE "MealService" (
  "id"            TEXT NOT NULL,
  "servedOn"      DATE NOT NULL,
  "sitting"       "MealSitting" NOT NULL,
  "menuItemId"    TEXT,
  "dishServed"    TEXT,
  "allergens"     TEXT[],
  "openedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openedById"    TEXT,
  "closedAt"      TIMESTAMP(3),
  "expectedCount" INTEGER NOT NULL DEFAULT 0,
  "notes"         TEXT,
  CONSTRAINT "MealService_pkey" PRIMARY KEY ("id")
);

-- One breakfast per day. Without this a second sitting can be opened while the
-- first is still taking names, and the two registers each hold half the school.
CREATE UNIQUE INDEX "MealService_servedOn_sitting_key" ON "MealService" ("servedOn", "sitting");
CREATE INDEX "MealService_servedOn_idx" ON "MealService" ("servedOn");

ALTER TABLE "MealService"
  ADD CONSTRAINT "MealService_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "MealMenuItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MealService"
  ADD CONSTRAINT "MealService_closed_after_opened"
  CHECK ("closedAt" IS NULL OR "closedAt" >= "openedAt");

CREATE TABLE "MealServiceRecord" (
  "id"           TEXT NOT NULL,
  "serviceId"    TEXT NOT NULL,
  "studentId"    TEXT,
  "staffId"      TEXT,
  "guestName"    TEXT,
  "basis"        "MealBasis" NOT NULL DEFAULT 'PLAN',
  "chargedMinor" INTEGER NOT NULL DEFAULT 0,
  "servedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "servedBy"     TEXT,
  "warned"       BOOLEAN NOT NULL DEFAULT false,
  "warnedNote"   TEXT,
  CONSTRAINT "MealServiceRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MealServiceRecord_serviceId_idx" ON "MealServiceRecord" ("serviceId");
CREATE INDEX "MealServiceRecord_studentId_idx" ON "MealServiceRecord" ("studentId");
CREATE INDEX "MealServiceRecord_staffId_idx" ON "MealServiceRecord" ("staffId");

ALTER TABLE "MealServiceRecord"
  ADD CONSTRAINT "MealServiceRecord_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "MealService" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealServiceRecord"
  ADD CONSTRAINT "MealServiceRecord_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealServiceRecord"
  ADD CONSTRAINT "MealServiceRecord_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one diner per row: a pupil, a member of staff, or a named guest.
--
-- Two of them set would count one meal twice and appear on two people's
-- histories. None set is a meal served to nobody, which is how a headcount
-- comes out higher than the number of people in the hall.
ALTER TABLE "MealServiceRecord"
  ADD CONSTRAINT "MealServiceRecord_one_diner"
  CHECK (
    ("studentId" IS NOT NULL)::int
  + ("staffId"   IS NOT NULL)::int
  + (("guestName" IS NOT NULL AND "guestName" <> ''))::int
  = 1
  );

-- Nobody is served twice at one sitting. Partial rather than plain, because
-- several guests at one lunch all have a NULL studentId and would collide.
CREATE UNIQUE INDEX "MealServiceRecord_one_per_student"
  ON "MealServiceRecord" ("serviceId", "studentId")
  WHERE "studentId" IS NOT NULL;
CREATE UNIQUE INDEX "MealServiceRecord_one_per_staff"
  ON "MealServiceRecord" ("serviceId", "staffId")
  WHERE "staffId" IS NOT NULL;

ALTER TABLE "MealServiceRecord"
  ADD CONSTRAINT "MealServiceRecord_charge_nonnegative"
  CHECK ("chargedMinor" >= 0);
