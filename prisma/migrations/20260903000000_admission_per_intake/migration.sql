-- One application per child per intake, not one per child ever.
--
-- The constraint shipped as a plain unique index on studentId, while the
-- comment above it said "per intake" and the decline path two files away puts
-- a child back to APPLICANT precisely because "next year they often apply
-- again". With the old index they could not — not on that record, not ever.
-- A family turned down for Nursery 1 and encouraged to try again for Nursery 2
-- hit a dead end with no message and no way round it.
--
-- Safe to apply after the fact: the composite index is strictly weaker than
-- the one it replaces, so any data that satisfied the old constraint satisfies
-- this one.

DROP INDEX "AdmissionApplication_studentId_key";

CREATE UNIQUE INDEX "AdmissionApplication_studentId_academicYearId_key"
  ON "AdmissionApplication"("studentId", "academicYearId");

-- studentId alone is no longer unique, so it needs an index of its own for the
-- lookups that go the other way — a pupil's profile asking for their
-- application, which the unique index used to serve.
CREATE INDEX "AdmissionApplication_studentId_idx" ON "AdmissionApplication"("studentId");
