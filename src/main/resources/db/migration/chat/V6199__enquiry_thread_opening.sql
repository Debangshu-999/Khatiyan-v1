-- The enquiry's own words, held on its chat until someone first writes in it
-- (user, 2026-10-03).
--
-- An enquiry chat used to be created with the question already placed in it,
-- so it existed, and showed, before the handler had said anything. Now the
-- question is kept here and placed as the first message the moment the first
-- text is sent, and the chat is not listed until then. opening_message_seq
-- records where it was placed, so a reader who deleted the chat still sees
-- the question at the top when they open it again.
--
-- Older enquiry chats had it placed at creation and keep it as it is.
ALTER TABLE chat.chat_threads
    ADD COLUMN opening_message VARCHAR(1000),
    ADD COLUMN opening_author_user_id UUID,
    ADD COLUMN opening_message_seq BIGINT;
