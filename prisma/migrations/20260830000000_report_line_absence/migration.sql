-- Tell an absence apart from a component that does not exist.
--
-- Both leave the score null, and every renderer printed both as a dash. A
-- parent reading the card could not tell "your child missed the examination"
-- from "there was no examination in this subject".
--
-- Worse, until this release an absence was not null at all: it was scored as a
-- hard zero that still spent its full weight, so the card printed 0.0 and the
-- pupil's total, the class average and everybody's position all moved. That
-- arithmetic is fixed in src/lib/marks-math.ts; these two columns are what
-- lets the card say what happened instead of printing a number.
--
-- Defaulting to false is correct for existing rows: they were generated under
-- the old arithmetic, where an absence became a zero rather than a null, so
-- none of them is an absence as far as the data goes. Regenerating a term's
-- cards will set these properly — and will change the numbers, because the
-- zeros come out of the averages.

ALTER TABLE "ReportCardLine" ADD COLUMN "caAbsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReportCardLine" ADD COLUMN "examAbsent" BOOLEAN NOT NULL DEFAULT false;
