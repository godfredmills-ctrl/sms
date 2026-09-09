-- Staff attendance: the sign-in book.
--
-- The table is ordinary. The constraints are the point, because every one of
-- them is a sentence somebody would otherwise have to remember to write in an
-- action, and this register feeds payroll.

CREATE TABLE "StaffAttendance" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "arrivedMinutes" INTEGER,
    "leftMinutes" INTEGER,
    "minutesLate" INTEGER,
    "reason" TEXT,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffAttendance_date_idx" ON "StaffAttendance"("date");
CREATE INDEX "StaffAttendance_staffId_status_idx" ON "StaffAttendance"("staffId", "status");

-- One answer per person per day.
--
-- The head marks the register at assembly and the administrator marks it again
-- at ten, and without this the school holds two contradictory rows about
-- whether Mr Mensah came in. Payroll then picks one, and which one is an
-- accident of ordering.
CREATE UNIQUE INDEX "StaffAttendance_staffId_date_key" ON "StaffAttendance"("staffId", "date");

ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A clock time is minutes past midnight, and there are 1440 of them.
--
-- Stored as an Int rather than a timestamp on purpose: a sign-in book records
-- a clock time on a named day, and holding 07:45 as an instant means holding a
-- timezone with it. This is the same lesson the cover board learned when local
-- midnight in British Summer Time turned Thursday into Wednesday. An integer
-- between 0 and 1439 has nowhere to drift to.
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_arrived_is_a_clock_time"
  CHECK ("arrivedMinutes" IS NULL OR ("arrivedMinutes" >= 0 AND "arrivedMinutes" <= 1439));
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_left_is_a_clock_time"
  CHECK ("leftMinutes" IS NULL OR ("leftMinutes" >= 0 AND "leftMinutes" <= 1439));

-- Nobody leaves before they arrive.
--
-- Two fields filled in by one person in a hurry, and the pair of them is a
-- working day: the difference is what an hours report subtracts. Reversed, it
-- reports a negative day and the total for the month is quietly short.
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_left_after_arriving"
  CHECK (
    "leftMinutes" IS NULL
    OR "arrivedMinutes" IS NULL
    OR "leftMinutes" >= "arrivedMinutes"
  );

-- Somebody absent did not arrive.
--
-- The way this happens is not stupidity, it is editing: a row marked PRESENT
-- at 07:40 is changed to ABSENT when the head realises it was the other Mr
-- Mensah, and the arrival time is left behind. The row then reads as absent on
-- the register and present on any report that counts arrival times.
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_absent_did_not_arrive"
  CHECK (
    "status" <> 'ABSENT'
    OR ("arrivedMinutes" IS NULL AND "leftMinutes" IS NULL AND "minutesLate" IS NULL)
  );

-- Lateness is a positive number of minutes or it is not lateness.
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_lateness_is_positive"
  CHECK ("minutesLate" IS NULL OR "minutesLate" > 0);

-- A day in the future has not happened.
--
-- Marking tomorrow's register is how a school records an absence for somebody
-- who then turns up, and the row is already in payroll's arithmetic by the
-- time anyone looks. There is no legitimate reason to write one, so the
-- database refuses rather than the form.
--
-- Deliberately not a comparison against now() to the second: a register taken
-- at 07:30 in Accra is a day ahead of a server in UTC for the first hour of
-- the morning, and refusing the whole school's register for that hour would be
-- worse than the mistake it prevents. One day of slack, and it still catches
-- anybody marking a week ahead.
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_not_in_the_future"
  CHECK ("date" <= (CURRENT_DATE + 1));
