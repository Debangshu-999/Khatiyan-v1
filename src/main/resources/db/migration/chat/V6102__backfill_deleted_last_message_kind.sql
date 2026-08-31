-- Lets a thread say its newest message was withdrawn.
--
-- The column was constrained to the attachment kinds plus TEXT, so writing
-- DELETED failed outright. That is a constraint doing its job: without this
-- migration every message deletion would have thrown the moment it tried to
-- refresh the list preview.
ALTER TABLE chat.chat_threads
    DROP CONSTRAINT ck_chat_threads_last_message_kind;

ALTER TABLE chat.chat_threads
    ADD CONSTRAINT ck_chat_threads_last_message_kind
    CHECK (last_message_kind IS NULL
           OR last_message_kind IN ('TEXT', 'IMAGE', 'FILE', 'DELETED'));

-- Backfills threads whose newest message was already withdrawn before either
-- the DELETED kind or the preview refresh existed.
--
-- Those rows kept the words the message used to say, stamped TEXT, so the list
-- showed the original text of a message that is gone — the one place the
-- deletion had to be visible and was not.
--
-- Matched on the message rather than on the preview string. "Message deleted"
-- is copy and will be reworded or translated one day; whether the message has a
-- deleted_at is a fact about it. The literal below is the one thing that has to
-- agree with ChatMessage.preview(), and only for rows written before this ran.
UPDATE chat.chat_threads AS thread
SET last_message_kind = 'DELETED',
    last_message_preview = 'Message deleted'
FROM chat.chat_messages AS message
WHERE message.thread_id = thread.id
  AND message.seq = thread.last_message_seq
  AND message.deleted_at IS NOT NULL
  AND thread.last_message_kind IS DISTINCT FROM 'DELETED';
