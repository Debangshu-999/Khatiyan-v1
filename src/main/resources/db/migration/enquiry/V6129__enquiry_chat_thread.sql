-- The conversation an enquiry was answered in.
--
-- Denormalised on purpose. The alternative is asking the chat module for a
-- thread by origin id, which is one extra query per enquiry on a list endpoint
-- that already renders a page of them. The pointer is written once, by the
-- responder who opens the thread, and never changes after.
--
-- Nullable and staying that way: most enquiries are answered by phone or email
-- and never grow a conversation at all.
ALTER TABLE enquiry.enquiries
    ADD COLUMN chat_thread_id UUID;

-- No foreign key. chat.chat_threads belongs to another module, and a constraint
-- across that boundary is exactly the coupling the modulith is arranged to
-- avoid — it would also make deleting a conversation a schema problem for
-- enquiries rather than a chat one.
COMMENT ON COLUMN enquiry.enquiries.chat_thread_id
    IS 'chat.chat_threads.id of the conversation this enquiry was answered in, if any. No FK: cross-module.';
