-- The visitor log book.
--
-- Signing out is a timestamp rather than a deletion: the register has to be
-- able to answer "who is in the building right now" during a fire drill and
-- "who was on site that day" months later, and a row that disappears on the
-- way out can only answer the second.
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "organisation" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GUEST',
    "purpose" TEXT NOT NULL,
    "hostStaffId" TEXT,
    "aboutStudentId" TEXT,
    "idType" TEXT,
    "idNumber" TEXT,
    "vehicleReg" TEXT,
    "badgeNo" TEXT NOT NULL,
    "signedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedInById" TEXT,
    "signedOutAt" TIMESTAMP(3),
    "signedOutById" TEXT,
    "notes" TEXT,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Visitor_signedInAt_idx" ON "Visitor"("signedInAt");
CREATE INDEX "Visitor_signedOutAt_idx" ON "Visitor"("signedOutAt");
CREATE INDEX "Visitor_badgeNo_idx" ON "Visitor"("badgeNo");
CREATE INDEX "Visitor_hostStaffId_idx" ON "Visitor"("hostStaffId");
CREATE INDEX "Visitor_aboutStudentId_idx" ON "Visitor"("aboutStudentId");

ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_hostStaffId_fkey"
    FOREIGN KEY ("hostStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_aboutStudentId_fkey"
    FOREIGN KEY ("aboutStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
