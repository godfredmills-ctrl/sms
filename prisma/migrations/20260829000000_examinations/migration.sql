-- Examinations: running the sitting, not recording the mark.
--
-- Assessment already records what a candidate scored. These tables record the
-- sitting itself — which paper, at what hour, in which hall, in which seat,
-- watched by whom, and who did not turn up. A missing mark is found when a
-- report card is checked; a missing seat is found by a fifteen-year-old
-- standing in a doorway at nine in the morning.

CREATE TYPE "ExamSessionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'COMPLETED');
CREATE TYPE "SeatStatus" AS ENUM ('EXPECTED', 'PRESENT', 'ABSENT');

CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "termId" TEXT,
    "academicYearId" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "status" "ExamSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "instructions" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExamSession_academicYearId_idx" ON "ExamSession"("academicYearId");
CREATE INDEX "ExamSession_termId_idx" ON "ExamSession"("termId");
CREATE INDEX "ExamSession_status_idx" ON "ExamSession"("status");

CREATE TABLE "ExamVenue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamVenue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamVenue_name_key" ON "ExamVenue"("name");
CREATE INDEX "ExamVenue_active_idx" ON "ExamVenue"("active");

CREATE TABLE "ExamCandidate" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "candidateNo" TEXT NOT NULL,
    "classSectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamCandidate_pkey" PRIMARY KEY ("id")
);

-- One entry per pupil per session, and one index number per session. Both are
-- the database's job: an index number handed to two candidates is discovered
-- when two scripts come back with the same number on them.
CREATE UNIQUE INDEX "ExamCandidate_sessionId_studentId_key" ON "ExamCandidate"("sessionId", "studentId");
CREATE UNIQUE INDEX "ExamCandidate_sessionId_candidateNo_key" ON "ExamCandidate"("sessionId", "candidateNo");
CREATE INDEX "ExamCandidate_studentId_idx" ON "ExamCandidate"("studentId");
CREATE INDEX "ExamCandidate_classSectionId_idx" ON "ExamCandidate"("classSectionId");

CREATE TABLE "ExamPaper" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classLevelId" TEXT NOT NULL,
    "title" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 90,
    "maxMarks" INTEGER,
    "materials" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExamPaper_sessionId_idx" ON "ExamPaper"("sessionId");
CREATE INDEX "ExamPaper_startsAt_idx" ON "ExamPaper"("startsAt");
CREATE INDEX "ExamPaper_classLevelId_idx" ON "ExamPaper"("classLevelId");
CREATE INDEX "ExamPaper_subjectId_idx" ON "ExamPaper"("subjectId");

CREATE TABLE "ExamInvigilator" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ASSISTANT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamInvigilator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamInvigilator_paperId_staffId_key" ON "ExamInvigilator"("paperId", "staffId");
CREATE INDEX "ExamInvigilator_staffId_idx" ON "ExamInvigilator"("staffId");

CREATE TABLE "ExamSeat" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "venueId" TEXT,
    "seatNo" TEXT NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'EXPECTED',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSeat_pkey" PRIMARY KEY ("id")
);

-- One seat per candidate per paper, and one candidate per seat. The seat
-- number carries its hall in it ("A-014") so a paper split across two halls
-- cannot end up with two seat 14s that the constraint reads as one.
CREATE UNIQUE INDEX "ExamSeat_paperId_candidateId_key" ON "ExamSeat"("paperId", "candidateId");
CREATE UNIQUE INDEX "ExamSeat_paperId_seatNo_key" ON "ExamSeat"("paperId", "seatNo");
CREATE INDEX "ExamSeat_candidateId_idx" ON "ExamSeat"("candidateId");
CREATE INDEX "ExamSeat_venueId_idx" ON "ExamSeat"("venueId");
CREATE INDEX "ExamSeat_status_idx" ON "ExamSeat"("status");

ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_termId_fkey"
  FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExamCandidate" ADD CONSTRAINT "ExamCandidate_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamCandidate" ADD CONSTRAINT "ExamCandidate_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamCandidate" ADD CONSTRAINT "ExamCandidate_classSectionId_fkey"
  FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_classLevelId_fkey"
  FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamInvigilator" ADD CONSTRAINT "ExamInvigilator_paperId_fkey"
  FOREIGN KEY ("paperId") REFERENCES "ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamInvigilator" ADD CONSTRAINT "ExamInvigilator_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamSeat" ADD CONSTRAINT "ExamSeat_paperId_fkey"
  FOREIGN KEY ("paperId") REFERENCES "ExamPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamSeat" ADD CONSTRAINT "ExamSeat_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "ExamCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamSeat" ADD CONSTRAINT "ExamSeat_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "ExamVenue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
