-- Admissions: what a school actually decides an intake with.
--
-- A child could already be admitted — a Student row goes APPLICANT → OFFERED →
-- ENROLLED, one button at a time on their own profile. Missing was everything
-- in between: the entrance papers, the interview, an offer with a date on it,
-- and any way to see the whole intake at once.
--
-- The application hangs off the Student record rather than duplicating the
-- person. An applicant is already a pupil in every sense this database cares
-- about; they simply have not started.

CREATE TYPE "AdmissionSource" AS ENUM ('WALK_IN', 'WEBSITE', 'REFERRAL', 'AGENT', 'SIBLING', 'TRANSFER', 'OTHER');
CREATE TYPE "AdmissionDecision" AS ENUM ('RECOMMEND', 'RESERVE', 'DECLINE');

CREATE TABLE "AdmissionApplication" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "applyingForLevelId" TEXT,
    "source" "AdmissionSource" NOT NULL DEFAULT 'WALK_IN',
    "siblingId" TEXT,
    "appliedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applicationFeeMinor" INTEGER NOT NULL DEFAULT 0,
    "applicationFeePaid" BOOLEAN NOT NULL DEFAULT false,
    "offeredOn" TIMESTAMP(3),
    "offerExpiresOn" TIMESTAMP(3),
    "offerNote" TEXT,
    "acceptedOn" TIMESTAMP(3),
    "declinedOn" TIMESTAMP(3),
    "declineReason" TEXT,
    "waitlistRank" INTEGER,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionApplication_pkey" PRIMARY KEY ("id")
);

-- One application per child. A child applying again for a later intake is a
-- new Student record in this system, which is also how the rest of it treats
-- somebody who left and came back.
CREATE UNIQUE INDEX "AdmissionApplication_studentId_key" ON "AdmissionApplication"("studentId");
CREATE INDEX "AdmissionApplication_academicYearId_idx" ON "AdmissionApplication"("academicYearId");
CREATE INDEX "AdmissionApplication_applyingForLevelId_idx" ON "AdmissionApplication"("applyingForLevelId");
CREATE INDEX "AdmissionApplication_offerExpiresOn_idx" ON "AdmissionApplication"("offerExpiresOn");
CREATE INDEX "AdmissionApplication_waitlistRank_idx" ON "AdmissionApplication"("waitlistRank");

CREATE TABLE "AdmissionAssessment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "paper" TEXT NOT NULL,
    "score" DECIMAL(6,2),
    "maxScore" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "satOn" TIMESTAMP(3),
    "assessorId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionAssessment_pkey" PRIMARY KEY ("id")
);

-- One row per paper per applicant, so entering Mathematics twice corrects the
-- mark instead of averaging a child against themselves.
CREATE UNIQUE INDEX "AdmissionAssessment_applicationId_paper_key" ON "AdmissionAssessment"("applicationId", "paper");
CREATE INDEX "AdmissionAssessment_assessorId_idx" ON "AdmissionAssessment"("assessorId");

CREATE TABLE "AdmissionInterview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "heldOn" TIMESTAMP(3) NOT NULL,
    "interviewerId" TEXT,
    "attendees" TEXT,
    "decision" "AdmissionDecision" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionInterview_pkey" PRIMARY KEY ("id")
);

-- Deliberately not unique on the application: a family is sometimes seen
-- twice, and the second conversation is a different record rather than an
-- edit of the first.
CREATE INDEX "AdmissionInterview_applicationId_idx" ON "AdmissionInterview"("applicationId");
CREATE INDEX "AdmissionInterview_interviewerId_idx" ON "AdmissionInterview"("interviewerId");

ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_applyingForLevelId_fkey"
  FOREIGN KEY ("applyingForLevelId") REFERENCES "ClassLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_siblingId_fkey"
  FOREIGN KEY ("siblingId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdmissionAssessment" ADD CONSTRAINT "AdmissionAssessment_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionAssessment" ADD CONSTRAINT "AdmissionAssessment_assessorId_fkey"
  FOREIGN KEY ("assessorId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdmissionInterview" ADD CONSTRAINT "AdmissionInterview_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionInterview" ADD CONSTRAINT "AdmissionInterview_interviewerId_fkey"
  FOREIGN KEY ("interviewerId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
