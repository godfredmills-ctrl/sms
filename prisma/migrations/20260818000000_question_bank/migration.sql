-- Question bank: a QuizQuestion with no quiz is a bank entry, shelved by
-- subject and copied into quizzes rather than shared.
ALTER TABLE "QuizQuestion" ALTER COLUMN "quizId" DROP NOT NULL;
ALTER TABLE "QuizQuestion" ADD COLUMN "subjectId" TEXT;
ALTER TABLE "QuizQuestion" ADD COLUMN "createdById" TEXT;
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "QuizQuestion_subjectId_idx" ON "QuizQuestion"("subjectId");
