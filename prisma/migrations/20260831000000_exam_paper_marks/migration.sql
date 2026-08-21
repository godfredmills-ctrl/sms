-- Join the sitting to the marks it produced.
--
-- Until now a school ran the examination in one place and typed the marks in
-- another, and nothing connected them: a candidate the invigilator wrote down
-- as absent became, in the gradebook, a pupil with no mark entered — which the
-- report card treats as a different thing entirely.
--
-- A paper covers a year group; an assessment covers one class. So one paper
-- owns one assessment per section, and the key goes on Assessment.

ALTER TABLE "ExamPaper" ADD COLUMN "weight" DECIMAL(5,2);

ALTER TABLE "Assessment" ADD COLUMN "examPaperId" TEXT;

-- SetNull rather than Cascade — the opposite of every other relation in the
-- examinations module, and deliberately. Those cascade because a seat has no
-- meaning without its paper. A mark does: it is what the term is worth to a
-- child, and deleting a mistyped paper must not take it.
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_examPaperId_fkey"
  FOREIGN KEY ("examPaperId") REFERENCES "ExamPaper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One column per sitting per class. Postgres treats NULLs as distinct in a
-- unique index, so this constrains generated rows and leaves the ordinary
-- class tests — which all have a null examPaperId — completely alone.
CREATE UNIQUE INDEX "Assessment_examPaperId_offeringId_key" ON "Assessment"("examPaperId", "offeringId");
CREATE INDEX "Assessment_examPaperId_idx" ON "Assessment"("examPaperId");

-- isExam and category have always been independent and unenforced, and
-- src/lib/grading.ts branches on isExam alone. A paper-linked row that landed
-- in the continuous-assessment bucket would be a wrong report card with
-- nothing erroring anywhere, so it is made impossible rather than remembered.
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_examPaper_isExam_check"
  CHECK ("examPaperId" IS NULL OR ("isExam" = true AND "category" = 'EXAM'));

-- Existing assessments are left unlinked on purpose. Matching them to papers
-- by subject, level and term would be a guess, and it would be wrong in
-- exactly the schools that ran two sittings in one term — which are the
-- schools most likely to look.

-- A subject offering with no term is invisible to the examinations module,
-- which filters on the session's term, while remaining perfectly visible to
-- the gradebook. The result was a paper reporting "no candidates are entered"
-- when the candidates were entered and the offering simply had no term.
--
-- Backfilled here to the year's current term, or its first. The column stays
-- nullable: SET NOT NULL would fail outright on an academic year that has no
-- terms at all, and a migration that can refuse to apply on live data is not
-- worth the tidiness. src/app/(app)/academics/actions.ts now refuses to create
-- an offering without a term, so the population cannot grow.
-- Both guards below are load-bearing, because (year, term, subject, section)
-- is a plain unique index and Postgres reads two NULL terms as distinct. A
-- school can therefore already be holding duplicates that the index never
-- objected to, and a blind backfill would collide and abort the migration
-- partway through, on live data, at deploy time.
--
--   ROW_NUMBER ... = 1  — two null-term rows for the same class and subject
--                         would otherwise both be given the same term in one
--                         statement and collide with each other.
--   NOT EXISTS          — and a null-term row would collide with a real one
--                         that already holds that term.
--
-- Anything that would collide keeps its null term. It is already shadowed by
-- the row it duplicates, and a migration that leaves a duplicate alone is
-- worth far more than one that refuses to apply.
WITH target AS (
  SELECT
    o."id" AS offering_id,
    (
      SELECT t."id" FROM "Term" t
      WHERE t."academicYearId" = o."academicYearId"
      ORDER BY t."isCurrent" DESC, t."sequence" ASC
      LIMIT 1
    ) AS term_id,
    ROW_NUMBER() OVER (
      PARTITION BY o."academicYearId", o."subjectId", o."classSectionId"
      ORDER BY o."createdAt" ASC, o."id" ASC
    ) AS rank_in_group
  FROM "SubjectOffering" o
  WHERE o."termId" IS NULL
)
UPDATE "SubjectOffering" o
SET "termId" = target.term_id
FROM target
WHERE target.offering_id = o."id"
  AND target.term_id IS NOT NULL
  AND target.rank_in_group = 1
  AND NOT EXISTS (
    SELECT 1 FROM "SubjectOffering" other
    WHERE other."academicYearId" = o."academicYearId"
      AND other."termId" = target.term_id
      AND other."subjectId" = o."subjectId"
      AND other."classSectionId" = o."classSectionId"
  );
