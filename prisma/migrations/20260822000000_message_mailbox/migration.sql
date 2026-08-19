-- Per-person mailbox state on a conversation.
--
-- Archiving, trashing and drafts belong to the member, not the conversation:
-- Conversation.isArchived would have hidden a thread for everyone in it.

ALTER TABLE "ConversationMember" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'TO';
ALTER TABLE "ConversationMember" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "ConversationMember" ADD COLUMN "trashedAt" TIMESTAMP(3);
ALTER TABLE "ConversationMember" ADD COLUMN "draftBody" TEXT;
ALTER TABLE "ConversationMember" ADD COLUMN "draftUpdatedAt" TIMESTAMP(3);

CREATE INDEX "ConversationMember_userId_archivedAt_trashedAt_idx"
  ON "ConversationMember"("userId", "archivedAt", "trashedAt");

-- Who added a member, so the sender can see their own blind copies without
-- disclosing them to the other recipients.
ALTER TABLE "ConversationMember" ADD COLUMN "addedById" TEXT;
