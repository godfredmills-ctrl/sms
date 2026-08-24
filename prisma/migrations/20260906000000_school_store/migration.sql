-- The school store: the things that get used up.
--
-- The asset register holds what lasts — the bus, the generator, the
-- microscopes. This holds exercise books, chalk, cleaning materials and the
-- provisions the dining hall cooks with. Separate models because they answer
-- different questions: an asset is a particular thing with a tag on it, a
-- stock item is a quantity. One table for both would mean a register row for
-- every sack of rice.
--
-- Locations are shared with the asset register on purpose. A store room is a
-- store room, and two lists of the school's rooms would be two answers to the
-- same question.

CREATE TYPE "StockMovementKind" AS ENUM (
  'OPENING',
  'RECEIPT',
  'RETURN',
  'ISSUE',
  'WASTE',
  'ADJUSTMENT_UP',
  'ADJUSTMENT_DOWN'
);

CREATE TABLE "StockCategory" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "code"      TEXT,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StockCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockCategory_name_key" ON "StockCategory"("name");
CREATE INDEX "StockCategory_active_idx" ON "StockCategory"("active");

-- Quantities are DECIMAL(12,3), not floating point.
--
-- A store issues 2.5 kg of rice and 1.5 litres of disinfectant, and a hundred
-- of those added in binary floating point do not come back to the number
-- anybody counted. Three decimal places is enough for anything a school store
-- handles and is exact. The application carries the same quantities as integer
-- thousandths for the same reason.
CREATE TABLE "StockItem" (
  "id"              TEXT NOT NULL,
  "code"            TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "description"     TEXT,
  "categoryId"      TEXT NOT NULL,
  "unit"            TEXT NOT NULL DEFAULT 'each',
  "reorderLevel"    DECIMAL(12,3),
  "reorderQuantity" DECIMAL(12,3),
  "locationId"      TEXT,
  "perishable"      BOOLEAN NOT NULL DEFAULT false,
  "expiresOn"       TIMESTAMP(3),
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockItem_code_key" ON "StockItem"("code");
CREATE INDEX "StockItem_categoryId_idx" ON "StockItem"("categoryId");
CREATE INDEX "StockItem_locationId_idx" ON "StockItem"("locationId");
CREATE INDEX "StockItem_active_idx" ON "StockItem"("active");

CREATE TABLE "StockMovement" (
  "id"              TEXT NOT NULL,
  "itemId"          TEXT NOT NULL,
  "kind"            "StockMovementKind" NOT NULL,
  "quantity"        DECIMAL(12,3) NOT NULL,
  "unitCostMinor"   INTEGER,
  "occurredOn"      TIMESTAMP(3) NOT NULL,
  "reference"       TEXT,
  "issuedToId"      TEXT,
  "issuedToDept"    TEXT,
  "vendorId"        TEXT,
  "expenseId"       TEXT,
  "note"            TEXT,
  "recordedById"    TEXT,
  "recordedByLabel" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- The balance is the sum of the history, so every read of an item's stock
-- walks its movements in date order. This index is what makes that cheap.
CREATE INDEX "StockMovement_itemId_occurredOn_idx" ON "StockMovement"("itemId", "occurredOn");
CREATE INDEX "StockMovement_kind_idx" ON "StockMovement"("kind");
CREATE INDEX "StockMovement_reference_idx" ON "StockMovement"("reference");

-- Quantities are stored positive; the direction is the kind's alone. This
-- refuses the row that would otherwise be readable two ways.
ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_quantity_positive" CHECK ("quantity" > 0);

-- ---------------------------------------------------------------------------
-- References
--
-- A category cannot be deleted while items are filed under it: an item with no
-- category has no place in the store's totals. Movements cascade with their
-- item, because the balance is the history and half a history is a wrong
-- balance rather than a shorter one.

ALTER TABLE "StockItem"
  ADD CONSTRAINT "StockItem_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "StockCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockItem"
  ADD CONSTRAINT "StockItem_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "AssetLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_issuedToId_fkey"
  FOREIGN KEY ("issuedToId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
