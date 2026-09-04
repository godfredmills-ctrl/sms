-- Requisitions: asking for something before it is bought.
--
-- The half of expenditure that arrives in time to change anything. It exists
-- so a budget line can carry three figures rather than two: what has been
-- spent, what has been committed and not yet met, and what is actually left.

CREATE TYPE "RequisitionStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED'
);

CREATE TABLE "Requisition" (
  "id"                       TEXT NOT NULL,
  "reference"                TEXT NOT NULL,
  "title"                    TEXT NOT NULL,
  "justification"            TEXT,
  "categoryId"               TEXT NOT NULL,
  "department"               TEXT,
  "academicYearId"           TEXT,
  "termId"                   TEXT,
  "neededBy"                 TIMESTAMP(3),
  "requestedById"            TEXT NOT NULL,
  "status"                   "RequisitionStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt"              TIMESTAMP(3),
  "decidedById"              TEXT,
  "decidedAt"                TIMESTAMP(3),
  "decisionNote"             TEXT,
  "budgetAtDecisionMinor"    INTEGER,
  "committedAtDecisionMinor" INTEGER,
  "fulfilledAt"              TIMESTAMP(3),
  "expenseId"                TEXT,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Requisition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Requisition_reference_key" ON "Requisition" ("reference");
CREATE INDEX "Requisition_status_idx" ON "Requisition" ("status");
CREATE INDEX "Requisition_categoryId_idx" ON "Requisition" ("categoryId");
CREATE INDEX "Requisition_requestedById_idx" ON "Requisition" ("requestedById");
CREATE INDEX "Requisition_academicYearId_idx" ON "Requisition" ("academicYearId");
CREATE INDEX "Requisition_neededBy_idx" ON "Requisition" ("neededBy");

CREATE TABLE "RequisitionLine" (
  "id"                 TEXT NOT NULL,
  "requisitionId"      TEXT NOT NULL,
  "description"        TEXT NOT NULL,
  "stockItemId"        TEXT,
  "quantity"           INTEGER NOT NULL,
  "unit"               TEXT,
  "estimatedUnitMinor" INTEGER NOT NULL DEFAULT 0,
  "fulfilledQty"       INTEGER NOT NULL DEFAULT 0,
  "note"               TEXT,
  "sortKey"            INTEGER NOT NULL DEFAULT 0,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RequisitionLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RequisitionLine_requisitionId_idx" ON "RequisitionLine" ("requisitionId");
CREATE INDEX "RequisitionLine_stockItemId_idx" ON "RequisitionLine" ("stockItemId");

ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_academicYearId_fkey"
  FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_termId_fkey"
  FOREIGN KEY ("termId") REFERENCES "Term" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "Staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "Staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RequisitionLine"
  ADD CONSTRAINT "RequisitionLine_requisitionId_fkey"
  FOREIGN KEY ("requisitionId") REFERENCES "Requisition" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RequisitionLine"
  ADD CONSTRAINT "RequisitionLine_stockItemId_fkey"
  FOREIGN KEY ("stockItemId") REFERENCES "StockItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nobody approves their own requisition.
--
-- The whole of what a requisition process is. A school with one bursar and one
-- head has this rule so that neither of them alone can commit the school to
-- money; a school where the same person raises and approves has a filing
-- system, not a control. The screen refuses it and so does this, because the
-- screen can be got round and a constraint cannot.
--
-- ON DELETE SET NULL on the decider means a departed member of staff leaves
-- the row with a null decider rather than deleting the record, and NULL passes
-- this check, which is correct: what it forbids is the two being the same
-- person, not the decider being unknown.
ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_not_deciding_your_own"
  CHECK ("decidedById" IS NULL OR "decidedById" <> "requestedById");

-- A decision has a decider and a date.
--
-- Approved with neither is a commitment against the budget that nobody is
-- answerable for, which is the row somebody points at in April.
ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_decision_is_complete"
  CHECK (("status" IN ('DRAFT', 'SUBMITTED', 'CANCELLED'))
      OR ("decidedById" IS NOT NULL AND "decidedAt" IS NOT NULL));

-- Turned down says why.
--
-- Without a reason it goes round again unchanged, which is how a requisition
-- is refused three times over the same missing quotation.
ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_rejection_has_a_reason"
  CHECK ("status" <> 'REJECTED'
      OR ("decisionNote" IS NOT NULL AND length(btrim("decisionNote")) > 0));

-- Sent means sent: anything past draft carries the date it left the desk.
ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_submitted_when_sent"
  CHECK (("status" IN ('DRAFT', 'CANCELLED') OR "submittedAt" IS NOT NULL));

-- A request is for something.
ALTER TABLE "Requisition"
  ADD CONSTRAINT "Requisition_has_a_title"
  CHECK (length(btrim("title")) > 0);

ALTER TABLE "RequisitionLine"
  ADD CONSTRAINT "RequisitionLine_has_a_description"
  CHECK (length(btrim("description")) > 0);

-- A request for none of something is not a request, and the upper bound is
-- there because a quantity typed with an extra digit is approved on the
-- strength of a total nobody reads twice.
ALTER TABLE "RequisitionLine"
  ADD CONSTRAINT "RequisitionLine_quantity_is_sane"
  CHECK ("quantity" > 0 AND "quantity" <= 100000);

ALTER TABLE "RequisitionLine"
  ADD CONSTRAINT "RequisitionLine_price_is_sane"
  CHECK ("estimatedUnitMinor" >= 0 AND "estimatedUnitMinor" <= 100000000);

-- Received is between nothing and everything asked for.
--
-- More received than were asked for is not a delivery, it is a typing slip,
-- and left alone it makes the outstanding commitment negative, which quietly
-- adds money back to a budget line that nobody added to it.
ALTER TABLE "RequisitionLine"
  ADD CONSTRAINT "RequisitionLine_fulfilled_within_quantity"
  CHECK ("fulfilledQty" >= 0 AND "fulfilledQty" <= "quantity");
