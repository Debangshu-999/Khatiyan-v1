-- When the enquirer took back a Not interested (owner's design, 2026-10-03).
--
-- A Not interested enquiry closes by itself 7 days after it was marked. Until
-- then the enquirer sees it and may answer "Changed your mind?", which makes it
-- Interested again and tells the handler. Once only: marked Not interested a
-- second time, the enquiry closes at once.
ALTER TABLE enquiry.enquiries
    ADD COLUMN tenant_changed_mind_at TIMESTAMPTZ;

-- The hourly sweep's read: Not interested, still open, marked a while ago.
CREATE INDEX idx_enquiries_not_interested_open
    ON enquiry.enquiries (sentiment_set_at)
    WHERE sentiment = 'NOT_INTERESTED' AND ended_at IS NULL;
