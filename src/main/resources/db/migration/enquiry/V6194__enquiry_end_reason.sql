-- Why an enquiry ended, for the pill on the owner's expired card (owner's
-- design, 2026-10-03). Stored when it ends, never worked out later:
--
--   HANDLER_DID_NOT_RESPOND  ran out unanswered, nobody tried
--   TENANT_DID_NOT_RESPOND   ran out unanswered, attempts never reached them
--   NOT_INTERESTED           closed by the handler, or ran out marked so
--   NO_VISIT_BOOKED          answered, ran out with no visit
--   VISIT_CANCELLED          answered, its visit was cancelled and not rebooked
--   VISIT_BOOKED             answered, ran out with a visit still booked
ALTER TABLE enquiry.enquiries
    ADD COLUMN end_reason VARCHAR(30),
    ADD CONSTRAINT chk_enquiries_end_reason
        CHECK (end_reason IS NULL OR end_reason IN (
            'HANDLER_DID_NOT_RESPOND', 'TENANT_DID_NOT_RESPOND', 'NOT_INTERESTED',
            'NO_VISIT_BOOKED', 'VISIT_CANCELLED', 'VISIT_BOOKED'));

-- Closing no longer ends the 30 days (owner's rule, 2026-10-03): a closed
-- enquiry says Closed until its usual date, then Expired. Ones closed before
-- this had their date pulled in to the moment of closing, so it goes back.
UPDATE enquiry.enquiries
SET expires_at = created_at + INTERVAL '30 days'
WHERE ended_at IS NOT NULL;

-- The reasons for the enquiries that have already ended, read from what they
-- recorded. A one-off read of lead.visits: the visit facts live there.
UPDATE enquiry.enquiries e
SET end_reason = CASE
    WHEN e.ended_at IS NOT NULL THEN 'NOT_INTERESTED'
    WHEN e.status = 'EXPIRED' THEN
        CASE WHEN EXISTS (SELECT 1 FROM enquiry.enquiry_responses r WHERE r.enquiry_id = e.id)
             THEN 'TENANT_DID_NOT_RESPOND'
             ELSE 'HANDLER_DID_NOT_RESPOND' END
    WHEN e.sentiment = 'NOT_INTERESTED' THEN 'NOT_INTERESTED'
    WHEN EXISTS (SELECT 1 FROM lead.visits v WHERE v.enquiry_id = e.id AND v.status = 'SCHEDULED')
        THEN 'VISIT_BOOKED'
    WHEN EXISTS (SELECT 1 FROM lead.visits v WHERE v.enquiry_id = e.id AND v.status = 'CANCELLED')
        THEN 'VISIT_CANCELLED'
    ELSE 'NO_VISIT_BOOKED'
END
WHERE e.end_reason IS NULL
  AND (e.ended_at IS NOT NULL
       OR e.status = 'EXPIRED'
       OR (e.status = 'RESPONDED' AND e.window_closed_at IS NOT NULL));
