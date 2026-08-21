-- Documents the school writes: letters, reports, proposals, notices.
--
-- Distinct from Document (a file somebody uploaded) and from the generated
-- letters, whose wording is fixed. The body is Markdown; see src/lib/markdown.ts.

CREATE TABLE "WrittenDocument" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LETTER',
    "reference" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipient" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "salutation" TEXT,
    "closing" TEXT,
    "signatoryName" TEXT,
    "signatoryTitle" TEXT,
    "footnote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "finalisedAt" TIMESTAMP(3),
    "aboutStaffId" TEXT,
    "aboutStudentId" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WrittenDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WrittenDocument_status_idx" ON "WrittenDocument"("status");
CREATE INDEX "WrittenDocument_kind_idx" ON "WrittenDocument"("kind");
CREATE INDEX "WrittenDocument_aboutStaffId_idx" ON "WrittenDocument"("aboutStaffId");
CREATE INDEX "WrittenDocument_aboutStudentId_idx" ON "WrittenDocument"("aboutStudentId");
CREATE INDEX "WrittenDocument_updatedAt_idx" ON "WrittenDocument"("updatedAt");

ALTER TABLE "WrittenDocument" ADD CONSTRAINT "WrittenDocument_aboutStaffId_fkey"
    FOREIGN KEY ("aboutStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WrittenDocument" ADD CONSTRAINT "WrittenDocument_aboutStudentId_fkey"
    FOREIGN KEY ("aboutStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WrittenDocument" ADD CONSTRAINT "WrittenDocument_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A reference number identifies a document in correspondence, so two documents
-- may not share one. Partial, because most drafts have none yet and NULLs must
-- not collide with each other.
CREATE UNIQUE INDEX "WrittenDocument_reference_key"
    ON "WrittenDocument"("reference") WHERE "reference" IS NOT NULL;
