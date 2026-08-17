-- The SMS delivery-status cron asks "SENT SMS recipients from the last 48
-- hours" of the whole CommunicationRecipient table every run; without this
-- index that is a sequential scan that grows with every term's messaging.
CREATE INDEX "CommunicationRecipient_channel_status_sentAt_idx"
  ON "CommunicationRecipient" ("channel", "status", "sentAt");
