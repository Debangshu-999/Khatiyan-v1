-- The enquiry chat's action bar (owner's design, 2026-10-03).
--
--   * Sentiment: once the enquirer has replied, the handler records whether
--     they are interested. It can be changed.
--   * Ending: the handler can end the conversation. That closes the chat and
--     ends the enquiry's window on the spot.
--   * Every enquiry chat closes by itself when the enquiry's date passes.
--     chat_closed_at records that it was closed, so the sweep closes each one
--     once.

ALTER TABLE enquiry.enquiries
    ADD COLUMN sentiment VARCHAR(20),
    ADD COLUMN sentiment_set_by_user_id UUID,
    ADD COLUMN sentiment_set_at TIMESTAMPTZ,
    ADD COLUMN ended_at TIMESTAMPTZ,
    ADD COLUMN ended_by_user_id UUID,
    ADD COLUMN chat_closed_at TIMESTAMPTZ;

ALTER TABLE enquiry.enquiries
    ADD CONSTRAINT chk_enquiries_sentiment
        CHECK (sentiment IS NULL OR sentiment IN ('INTERESTED', 'NOT_INTERESTED')),
    -- A sentiment always comes with who set it and when.
    ADD CONSTRAINT chk_enquiries_sentiment_complete
        CHECK ((sentiment IS NULL AND sentiment_set_by_user_id IS NULL AND sentiment_set_at IS NULL)
            OR (sentiment IS NOT NULL AND sentiment_set_by_user_id IS NOT NULL AND sentiment_set_at IS NOT NULL)),
    ADD CONSTRAINT chk_enquiries_ended_complete
        CHECK ((ended_at IS NULL) = (ended_by_user_id IS NULL));

-- The sweep's question: which enquiries are past their date with a chat still open.
CREATE INDEX idx_enquiries_chat_to_close
    ON enquiry.enquiries (expires_at)
    WHERE chat_thread_id IS NOT NULL AND chat_closed_at IS NULL;
