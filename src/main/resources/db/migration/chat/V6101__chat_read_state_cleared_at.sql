-- Deleting a conversation, from one person's side only.
--
-- Nothing is removed. The reader's own read-state row records how far the
-- thread had got when they cleared it, and both the list and the message page
-- read past that mark. The other side is unaffected and still sees everything.
--
-- Two behaviours fall out of the one column, which is why there is no separate
-- "hidden" flag to keep in step with it:
--
--   * The thread disappears from the list, because a cleared thread is only
--     listed when its head has moved past the mark.
--   * Starting again with the same person is a clean slate, because the
--     message page starts after the mark rather than at the beginning. The old
--     messages are still there for the other side, and still in this table.
--
-- A new message from the other side brings the thread back on its own, showing
-- only what arrived after the clear. That is deliberate: a deleted conversation
-- must not become a hole that swallows what somebody says next.
ALTER TABLE chat.chat_read_state
    ADD COLUMN cleared_at_seq BIGINT NOT NULL DEFAULT 0;
