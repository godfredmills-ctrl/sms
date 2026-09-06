-- Billing by the month, alongside billing by the term.
--
-- Additive throughout. Every existing fee structure becomes TERM, which is
-- what it already was, and every existing invoice keeps a null billingMonth,
-- which is what a termly bill has. A school that never touches this sees no
-- change at all.

CREATE TYPE "BillingCycle" AS ENUM ('TERM', 'MONTHLY');

ALTER TABLE "FeeStructure"
  ADD COLUMN "cycle" "BillingCycle" NOT NULL DEFAULT 'TERM',
  ADD COLUMN "dueDayOfMonth" INTEGER;

ALTER TABLE "Invoice"
  ADD COLUMN "billingMonth" DATE;

-- A pupil is billed once for a month.
--
-- Re-running a month is the single most likely mistake in monthly billing:
-- somebody presses generate twice, or two people do it, or a run that half
-- failed is started again. The generator checks first, but a check is a race
-- and an index is not.
--
-- Partial, because it has to be. NULL is not equal to NULL in an index, so a
-- plain unique over (studentId, billingMonth) would permit any number of
-- termly invoices per pupil, which is exactly what a school has: three a year,
-- all with a null month.
CREATE UNIQUE INDEX "Invoice_one_per_student_per_month"
  ON "Invoice" ("studentId", "billingMonth")
  WHERE "billingMonth" IS NOT NULL;

CREATE INDEX "Invoice_billingMonth_idx" ON "Invoice" ("billingMonth");

-- A billing month is a month, not a day in one.
--
-- Everything downstream groups and labels by this column, so a bill stamped
-- with the eighth of September sorts and reads as its own month and quietly
-- escapes the unique index above: two invoices dated the 1st and the 8th are
-- two different values, and the school has billed September twice.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_billing_month_is_a_month"
  CHECK ("billingMonth" IS NULL OR EXTRACT(DAY FROM "billingMonth") = 1);

-- A due day is a day of a month.
--
-- Zero and thirty-two are typing slips that would otherwise be clamped
-- silently at billing time, so the school would never learn that what it typed
-- was not what it got.
ALTER TABLE "FeeStructure"
  ADD CONSTRAINT "FeeStructure_due_day_is_a_day"
  CHECK ("dueDayOfMonth" IS NULL OR ("dueDayOfMonth" >= 1 AND "dueDayOfMonth" <= 31));

-- A monthly structure says when its bills fall due.
--
-- A termly structure has dueDate for this. A monthly one cannot: one date
-- cannot serve nine bills, so it needs the day of the month instead, and a
-- monthly structure without one produces bills that are due nowhere.
ALTER TABLE "FeeStructure"
  ADD CONSTRAINT "FeeStructure_monthly_has_a_due_day"
  CHECK ("cycle" <> 'MONTHLY' OR "dueDayOfMonth" IS NOT NULL);
