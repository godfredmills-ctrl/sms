-- The asset register: what the school owns.
--
-- The expenditure module has carried a CAPITAL category since it was written —
-- "something that lasts: a building, a bus, equipment" — with nothing on the
-- other side of it. A school could record buying a generator and then own no
-- generator. Asset.expenseId is the join that closes it, and it is deliberately
-- not unique: one invoice buys thirty chairs, and each chair is its own asset
-- with its own tag.

CREATE TYPE "AssetStatus" AS ENUM (
  'IN_USE',
  'IN_STORE',
  'UNDER_REPAIR',
  'MISSING',
  'DISPOSED',
  'WRITTEN_OFF'
);

CREATE TYPE "AssetCondition" AS ENUM (
  'NEW',
  'GOOD',
  'FAIR',
  'POOR',
  'UNSERVICEABLE'
);

CREATE TYPE "AssetEventKind" AS ENUM (
  'ACQUIRED',
  'MOVED',
  'ASSIGNED',
  'RETURNED',
  'VERIFIED',
  'CONDITION_CHANGED',
  'STATUS_CHANGED',
  'SERVICED',
  'DISPOSED'
);

-- ---------------------------------------------------------------------------

CREATE TABLE "AssetCategory" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "code"            TEXT,
  "usefulLifeYears" INTEGER,
  "residualPercent" INTEGER NOT NULL DEFAULT 0,
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetCategory_name_key" ON "AssetCategory"("name");
CREATE INDEX "AssetCategory_active_idx" ON "AssetCategory"("active");

CREATE TABLE "AssetLocation" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "building"  TEXT,
  "room"      TEXT,
  "campusId"  TEXT,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssetLocation_pkey" PRIMARY KEY ("id")
);

-- Not the plain UNIQUE ("name", "building") the schema declares.
--
-- Postgres treats NULLs as distinct in a unique index, so a plain one would
-- happily accept "Science Lab" with no building twice — and two locations with
-- the same name is precisely the confusion a stock-take cannot resolve, since
-- the person holding the clipboard has only the name to go on. COALESCE makes
-- the absent building a value like any other. Prisma cannot express an index
-- over an expression, so the schema carries the closest thing it can say and
-- this is the constraint that actually applies.
CREATE UNIQUE INDEX "AssetLocation_name_building_key"
  ON "AssetLocation"("name", COALESCE("building", ''));

CREATE INDEX "AssetLocation_active_idx" ON "AssetLocation"("active");

CREATE TABLE "Asset" (
  "id"                    TEXT NOT NULL,
  "tag"                   TEXT NOT NULL,
  "name"                  TEXT NOT NULL,
  "description"           TEXT,
  "categoryId"            TEXT NOT NULL,
  "serialNumber"          TEXT,
  "model"                 TEXT,
  "manufacturer"          TEXT,
  "status"                "AssetStatus" NOT NULL DEFAULT 'IN_USE',
  "condition"             "AssetCondition" NOT NULL DEFAULT 'GOOD',
  "locationId"            TEXT,
  "custodianId"           TEXT,
  "purchasedOn"           TIMESTAMP(3),
  "costMinor"             INTEGER NOT NULL DEFAULT 0,
  "residualMinor"         INTEGER NOT NULL DEFAULT 0,
  "usefulLifeYears"       INTEGER,
  "vendorId"              TEXT,
  "expenseId"             TEXT,
  "warrantyExpiresOn"     TIMESTAMP(3),
  "serviceIntervalMonths" INTEGER,
  "lastServicedOn"        TIMESTAMP(3),
  "lastVerifiedOn"        TIMESTAMP(3),
  "disposedOn"            TIMESTAMP(3),
  "disposalProceedsMinor" INTEGER NOT NULL DEFAULT 0,
  "disposalNote"          TEXT,
  "photoFileId"           TEXT,
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Asset_tag_key" ON "Asset"("tag");
CREATE INDEX "Asset_categoryId_idx" ON "Asset"("categoryId");
CREATE INDEX "Asset_locationId_idx" ON "Asset"("locationId");
CREATE INDEX "Asset_custodianId_idx" ON "Asset"("custodianId");
CREATE INDEX "Asset_status_idx" ON "Asset"("status");
CREATE INDEX "Asset_expenseId_idx" ON "Asset"("expenseId");

CREATE TABLE "AssetEvent" (
  "id"              TEXT NOT NULL,
  "assetId"         TEXT NOT NULL,
  "kind"            "AssetEventKind" NOT NULL,
  "occurredOn"      TIMESTAMP(3) NOT NULL,
  "fromLocationId"  TEXT,
  "toLocationId"    TEXT,
  "fromStaffId"     TEXT,
  "toStaffId"       TEXT,
  "note"            TEXT,
  "recordedById"    TEXT,
  "recordedByLabel" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssetEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssetEvent_assetId_occurredOn_idx" ON "AssetEvent"("assetId", "occurredOn");

CREATE TABLE "AssetMaintenance" (
  "id"              TEXT NOT NULL,
  "assetId"         TEXT NOT NULL,
  "kind"            TEXT NOT NULL,
  "performedOn"     TIMESTAMP(3) NOT NULL,
  "nextDueOn"       TIMESTAMP(3),
  "description"     TEXT NOT NULL,
  "costMinor"       INTEGER NOT NULL DEFAULT 0,
  "vendorId"        TEXT,
  "expenseId"       TEXT,
  "recordedById"    TEXT,
  "recordedByLabel" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AssetMaintenance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssetMaintenance_assetId_performedOn_idx"
  ON "AssetMaintenance"("assetId", "performedOn");

-- ---------------------------------------------------------------------------
-- References
--
-- A category cannot be deleted while anything is filed under it (RESTRICT):
-- an asset with no category has no depreciation rule and no place in the
-- register's totals. Everything optional is SET NULL, so retiring a location
-- or a departing custodian never deletes the record of a thing the school
-- still owns. History cascades with its asset, because an event about nothing
-- is not history.

ALTER TABLE "AssetLocation"
  ADD CONSTRAINT "AssetLocation_campusId_fkey"
  FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "AssetLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_custodianId_fkey"
  FOREIGN KEY ("custodianId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_photoFileId_fkey"
  FOREIGN KEY ("photoFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetEvent"
  ADD CONSTRAINT "AssetEvent_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetEvent"
  ADD CONSTRAINT "AssetEvent_fromLocationId_fkey"
  FOREIGN KEY ("fromLocationId") REFERENCES "AssetLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetEvent"
  ADD CONSTRAINT "AssetEvent_toLocationId_fkey"
  FOREIGN KEY ("toLocationId") REFERENCES "AssetLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetEvent"
  ADD CONSTRAINT "AssetEvent_fromStaffId_fkey"
  FOREIGN KEY ("fromStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetEvent"
  ADD CONSTRAINT "AssetEvent_toStaffId_fkey"
  FOREIGN KEY ("toStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetMaintenance"
  ADD CONSTRAINT "AssetMaintenance_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetMaintenance"
  ADD CONSTRAINT "AssetMaintenance_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssetMaintenance"
  ADD CONSTRAINT "AssetMaintenance_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
