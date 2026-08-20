-- School transport: routes, the stops on them, the buses that run them, and
-- which child stands at which stop.

CREATE TABLE "TransportRoute" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMins" INTEGER,
    "feeMinor" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRoute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransportRoute_code_key" ON "TransportRoute"("code");
CREATE INDEX "TransportRoute_isActive_idx" ON "TransportRoute"("isActive");

CREATE TABLE "TransportStop" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "landmark" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "pickupTime" TEXT,
    "dropoffTime" TEXT,

    CONSTRAINT "TransportStop_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TransportStop_routeId_sequence_idx" ON "TransportStop"("routeId", "sequence");

ALTER TABLE "TransportStop" ADD CONSTRAINT "TransportStop_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TransportVehicle" (
    "id" TEXT NOT NULL,
    "routeId" TEXT,
    "registration" TEXT NOT NULL,
    "make" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 30,
    "driverStaffId" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "assistantName" TEXT,
    "assistantPhone" TEXT,
    "roadworthyExpiry" TIMESTAMP(3),
    "insuranceExpiry" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportVehicle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransportVehicle_registration_key" ON "TransportVehicle"("registration");
CREATE INDEX "TransportVehicle_routeId_idx" ON "TransportVehicle"("routeId");
CREATE INDEX "TransportVehicle_isActive_idx" ON "TransportVehicle"("isActive");

ALTER TABLE "TransportVehicle" ADD CONSTRAINT "TransportVehicle_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransportVehicle" ADD CONSTRAINT "TransportVehicle_driverStaffId_fkey"
    FOREIGN KEY ("driverStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TransportAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "stopId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'BOTH',
    "collectedBy" TEXT,
    "notes" TEXT,
    "startedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TransportAssignment_routeId_idx" ON "TransportAssignment"("routeId");
CREATE INDEX "TransportAssignment_studentId_idx" ON "TransportAssignment"("studentId");
CREATE INDEX "TransportAssignment_stopId_idx" ON "TransportAssignment"("stopId");
CREATE INDEX "TransportAssignment_endedOn_idx" ON "TransportAssignment"("endedOn");

ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_routeId_fkey"
    FOREIGN KEY ("routeId") REFERENCES "TransportRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TransportAssignment" ADD CONSTRAINT "TransportAssignment_stopId_fkey"
    FOREIGN KEY ("stopId") REFERENCES "TransportStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "Which bus is this child on" must have exactly one answer at half past
-- three. A child may have one live morning arrangement and one live afternoon
-- one, or a single BOTH — so the index keys on direction as well, and the
-- action refuses BOTH alongside either half.
CREATE UNIQUE INDEX "TransportAssignment_one_live_per_direction"
    ON "TransportAssignment"("studentId", "direction") WHERE "endedOn" IS NULL;

-- A stop belongs to the route it is on. Without this a child could be put on
-- Route 3 standing at a Route 1 stop, and the manifest would print them in a
-- place the bus never goes. Prisma cannot express a cross-row CHECK, so it is
-- enforced in the action; this trigger is the backstop for anything that
-- writes to the table without going through it.
CREATE OR REPLACE FUNCTION "transport_stop_matches_route"() RETURNS trigger AS $$
BEGIN
  IF NEW."stopId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "TransportStop" s
    WHERE s."id" = NEW."stopId" AND s."routeId" = NEW."routeId"
  ) THEN
    RAISE EXCEPTION 'stop % is not on route %', NEW."stopId", NEW."routeId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TransportAssignment_stop_on_route"
  BEFORE INSERT OR UPDATE ON "TransportAssignment"
  FOR EACH ROW EXECUTE FUNCTION "transport_stop_matches_route"();
