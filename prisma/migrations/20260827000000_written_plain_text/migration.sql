-- A searchable copy of a written document, with the Markdown taken out.
--
-- The register searched the body itself, which is the source: a search for
-- "head teacher" missed "the **head** teacher", and a search for a lone
-- asterisk matched every document with a footnote mark in it. Searching a
-- derived plain-text column instead means the register finds words rather
-- than syntax. It is written from the body on every save.

ALTER TABLE "WrittenDocument" ADD COLUMN "plainText" TEXT NOT NULL DEFAULT '';

-- Backfill: rows written before this column existed still have to be findable.
-- This is the crude form of what markdownToText does — enough that an existing
-- draft is searchable, and every save after this replaces it with the real
-- thing. Applied in one statement per marker so the intent stays readable.
UPDATE "WrittenDocument"
SET "plainText" = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace("body", '[*_`]', '', 'g'),
      '^\s*#{1,3}\s+', '', 'gm'
    ),
    '^\s*>\s?', '', 'gm'
  ),
  '\|', ' ', 'g'
);

-- Deliberately unindexed. The register searches it with a substring match,
-- which a btree cannot serve; and a btree entry has a size limit a long
-- proposal would exceed, so the index would start refusing to store documents
-- rather than start finding them. A trigram index is the answer if this ever
-- gets slow, and it needs an extension this database does not yet have.
