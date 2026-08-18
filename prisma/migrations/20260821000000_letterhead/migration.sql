-- Optional letterhead artwork. Without it, documents draw a letterhead from
-- the crest, the school name and the contact fields already on the record.
ALTER TABLE "School" ADD COLUMN "letterheadUrl" TEXT;
