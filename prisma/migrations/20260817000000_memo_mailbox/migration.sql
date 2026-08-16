-- Per-recipient mailbox state. One memo has many readers, and each archives or
-- discards their own copy; trash is restorable, so the row survives.
ALTER TABLE "MemoRecipient" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "MemoRecipient" ADD COLUMN "trashedAt" TIMESTAMP(3);
