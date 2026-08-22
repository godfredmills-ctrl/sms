-- Boarding: houses, beds, and who is off the premises.
--
-- Student.isBoarder / house / dormitory / roomNumber stay where they are. They
-- are free text, and free text can say a child is in Room 14 of a house that
-- does not exist and say it of thirty children about a room that sleeps eight.
-- Nothing counted the beds. These tables do.
--
-- The exeat half matters more than the beds. A boarder leaving the compound is
-- signed out to a named adult and signed back in, and that record is the same
-- kind of thing as the visitor log and the bus manifest: it is what the school
-- has when somebody asks where a child is.

CREATE TYPE "BoardingGender" AS ENUM ('BOYS', 'GIRLS', 'MIXED');
CREATE TYPE "ExeatStatus" AS ENUM ('REQUESTED', 'APPROVED', 'OUT', 'RETURNED', 'CANCELLED');

CREATE TABLE "BoardingHouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "gender" "BoardingGender" NOT NULL DEFAULT 'MIXED',
    "houseParentId" TEXT,
    "assistantId" TEXT,
    "colour" TEXT,
    "motto" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardingHouse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoardingHouse_name_key" ON "BoardingHouse"("name");
CREATE INDEX "BoardingHouse_active_idx" ON "BoardingHouse"("active");

CREATE TABLE "BoardingRoom" (
    "id" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "floor" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardingRoom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoardingRoom_houseId_name_key" ON "BoardingRoom"("houseId", "name");
CREATE INDEX "BoardingRoom_active_idx" ON "BoardingRoom"("active");

CREATE TABLE "BoardingAllocation" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "bedLabel" TEXT,
    "startedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedOn" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardingAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardingAllocation_studentId_idx" ON "BoardingAllocation"("studentId");
CREATE INDEX "BoardingAllocation_roomId_idx" ON "BoardingAllocation"("roomId");
CREATE INDEX "BoardingAllocation_academicYearId_idx" ON "BoardingAllocation"("academicYearId");
CREATE INDEX "BoardingAllocation_endedOn_idx" ON "BoardingAllocation"("endedOn");

-- One open bed per child per year, enforced by the database rather than by
-- remembering to close the old row. A partial unique index is the only way to
-- say "unique among the rows that are still open" — a plain one would forbid a
-- child from ever having lived in two rooms, which is the history the closed
-- rows exist to keep.
CREATE UNIQUE INDEX "BoardingAllocation_one_open_bed"
  ON "BoardingAllocation" ("studentId", "academicYearId")
  WHERE "endedOn" IS NULL;

CREATE TABLE "BoardingExeat" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "houseId" TEXT,
    "reason" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departsAt" TIMESTAMP(3) NOT NULL,
    "dueBackAt" TIMESTAMP(3) NOT NULL,
    "releasedToName" TEXT NOT NULL,
    "releasedToPhone" TEXT,
    "relationship" TEXT,
    "status" "ExeatStatus" NOT NULL DEFAULT 'REQUESTED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "signedOutAt" TIMESTAMP(3),
    "signedOutById" TEXT,
    "signedInAt" TIMESTAMP(3),
    "signedInById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardingExeat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardingExeat_studentId_idx" ON "BoardingExeat"("studentId");
CREATE INDEX "BoardingExeat_houseId_idx" ON "BoardingExeat"("houseId");
CREATE INDEX "BoardingExeat_status_idx" ON "BoardingExeat"("status");
CREATE INDEX "BoardingExeat_dueBackAt_idx" ON "BoardingExeat"("dueBackAt");
CREATE INDEX "BoardingExeat_departsAt_idx" ON "BoardingExeat"("departsAt");

-- A child can be off the premises once at a time. Same reasoning as the bed:
-- the constraint is on the open rows only, because the closed ones are the
-- record of every previous leave-out and must be allowed to pile up.
CREATE UNIQUE INDEX "BoardingExeat_one_out_at_a_time"
  ON "BoardingExeat" ("studentId")
  WHERE "status" = 'OUT';

ALTER TABLE "BoardingHouse" ADD CONSTRAINT "BoardingHouse_houseParentId_fkey"
  FOREIGN KEY ("houseParentId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BoardingHouse" ADD CONSTRAINT "BoardingHouse_assistantId_fkey"
  FOREIGN KEY ("assistantId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BoardingRoom" ADD CONSTRAINT "BoardingRoom_houseId_fkey"
  FOREIGN KEY ("houseId") REFERENCES "BoardingHouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardingAllocation" ADD CONSTRAINT "BoardingAllocation_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "BoardingRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardingAllocation" ADD CONSTRAINT "BoardingAllocation_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardingAllocation" ADD CONSTRAINT "BoardingAllocation_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardingExeat" ADD CONSTRAINT "BoardingExeat_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardingExeat" ADD CONSTRAINT "BoardingExeat_houseId_fkey"
  FOREIGN KEY ("houseId") REFERENCES "BoardingHouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BoardingExeat" ADD CONSTRAINT "BoardingExeat_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BoardingExeat" ADD CONSTRAINT "BoardingExeat_signedOutById_fkey"
  FOREIGN KEY ("signedOutById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BoardingExeat" ADD CONSTRAINT "BoardingExeat_signedInById_fkey"
  FOREIGN KEY ("signedInById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
