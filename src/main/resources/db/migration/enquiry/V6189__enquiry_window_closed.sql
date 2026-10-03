-- Marks the moment an answered enquiry's window was seen to close (2026-10-03).
--
-- An unanswered enquiry announces its end by moving to EXPIRED. An answered one
-- stays RESPONDED past its date, so nothing told the leads pipeline it was
-- over. It needs to know: a person back at Enquired, answered, with no visit
-- booked (never booked, or their visit was cancelled), is finished when their
-- enquiry's window closes (owner's rule, 2026-10-03).
--
-- The hourly sweep sets this once per enquiry and announces it, so the
-- announcement is made once.
ALTER TABLE enquiry.enquiries
    ADD COLUMN window_closed_at TIMESTAMPTZ;

CREATE INDEX idx_enquiries_answered_window_open
    ON enquiry.enquiries (expires_at)
    WHERE status = 'RESPONDED' AND window_closed_at IS NULL AND ended_at IS NULL;
