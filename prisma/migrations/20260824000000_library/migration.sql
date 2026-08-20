-- The school library: titles, the physical copies of them, and who has one.

CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "isbn" TEXT,
    "publisher" TEXT,
    "published" INTEGER,
    "edition" TEXT,
    "category" TEXT NOT NULL DEFAULT 'FICTION',
    "shelfMark" TEXT,
    "language" TEXT NOT NULL DEFAULT 'English',
    "subjectId" TEXT,
    "minLevelSequence" INTEGER,
    "summary" TEXT,
    "coverUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LibraryItem_title_idx" ON "LibraryItem"("title");
CREATE INDEX "LibraryItem_isbn_idx" ON "LibraryItem"("isbn");
CREATE INDEX "LibraryItem_category_idx" ON "LibraryItem"("category");
CREATE INDEX "LibraryItem_subjectId_idx" ON "LibraryItem"("subjectId");

ALTER TABLE "LibraryItem" ADD CONSTRAINT "LibraryItem_subjectId_fkey"
    FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LibraryCopy" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "accessionNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "acquiredOn" TIMESTAMP(3),
    "costMinor" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryCopy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LibraryCopy_accessionNo_key" ON "LibraryCopy"("accessionNo");
CREATE INDEX "LibraryCopy_itemId_idx" ON "LibraryCopy"("itemId");
CREATE INDEX "LibraryCopy_status_idx" ON "LibraryCopy"("status");

ALTER TABLE "LibraryCopy" ADD CONSTRAINT "LibraryCopy_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "LibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LibraryLoan" (
    "id" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "studentId" TEXT,
    "staffId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "returnedById" TEXT,
    "renewals" INTEGER NOT NULL DEFAULT 0,
    "fineMinor" INTEGER,
    "returnCondition" TEXT,
    "notes" TEXT,

    CONSTRAINT "LibraryLoan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LibraryLoan_copyId_idx" ON "LibraryLoan"("copyId");
CREATE INDEX "LibraryLoan_studentId_idx" ON "LibraryLoan"("studentId");
CREATE INDEX "LibraryLoan_staffId_idx" ON "LibraryLoan"("staffId");
CREATE INDEX "LibraryLoan_returnedAt_idx" ON "LibraryLoan"("returnedAt");
CREATE INDEX "LibraryLoan_dueAt_idx" ON "LibraryLoan"("dueAt");

ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_copyId_fkey"
    FOREIGN KEY ("copyId") REFERENCES "LibraryCopy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A loan belongs to exactly one borrower. Prisma cannot express this, and a
-- row that belongs to nobody — or to a pupil and a teacher at once — is not a
-- state any reader of this table should have to interpret. Enforced here so
-- it cannot be reached by any path, including a future import script.
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_one_borrower"
    CHECK (("studentId" IS NOT NULL) <> ("staffId" IS NOT NULL));

-- One live loan per copy. Two people cannot hold the same physical book, and
-- the desk under pressure is exactly where a double-issue happens: a partial
-- unique index makes it impossible rather than unlikely, while leaving any
-- number of returned loans in the history.
CREATE UNIQUE INDEX "LibraryLoan_one_live_loan_per_copy"
    ON "LibraryLoan"("copyId") WHERE "returnedAt" IS NULL;
