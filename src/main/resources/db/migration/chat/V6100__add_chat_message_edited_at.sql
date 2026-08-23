-- When a message was last rewritten by its author.
--
-- Recorded rather than inferred, and surfaced to both sides. A conversation is
-- a record of what people said to each other; letting one party silently change
-- their half after the other has read it turns that record into something the
-- reader cannot trust. The marker is the price of allowing the edit at all.
--
-- NULL means never edited, which is the overwhelming majority.
ALTER TABLE chat.chat_messages
    ADD COLUMN edited_at TIMESTAMPTZ;
