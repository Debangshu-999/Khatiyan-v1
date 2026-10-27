-- Post-visit booking eligibility. Immutable from first write: future corrections
-- must use a later Flyway version, including any changes to this backfill.
ALTER TABLE enquiry.enquiries
    ADD COLUMN booking_visit_id UUID,
    ADD COLUMN booking_visit_date DATE,
    ADD COLUMN pre_visit_expires_at TIMESTAMPTZ,
    ADD COLUMN booking_window_closed_at TIMESTAMPTZ,
    ADD CONSTRAINT chk_enquiry_post_visit_source CHECK (
        (booking_visit_id IS NULL AND booking_visit_date IS NULL
            AND pre_visit_expires_at IS NULL AND booking_window_closed_at IS NULL)
        OR (booking_visit_id IS NOT NULL AND booking_visit_date IS NOT NULL
            AND pre_visit_expires_at IS NOT NULL));

CREATE UNIQUE INDEX uq_enquiries_booking_visit
    ON enquiry.enquiries (booking_visit_id) WHERE booking_visit_id IS NOT NULL;

-- User decision, 9 October: backfill ONLY currently open enquiries. Never
-- resurrect an expired, explicitly closed, replaced or previously closed chat.
-- The visit's original India-local date supplies the clock, not deployment day.
-- VISITED without actual recorded check-in is not proof of attendance.
UPDATE enquiry.enquiries e
SET booking_visit_id = v.id,
    booking_visit_date = v.visit_date,
    pre_visit_expires_at = e.expires_at,
    expires_at = ((v.visit_date + 31)::timestamp AT TIME ZONE 'Asia/Kolkata'),
    updated_at = CURRENT_TIMESTAMP,
    version = e.version + 1
FROM lead.visits v
WHERE v.enquiry_id = e.id
  AND v.property_id = e.property_id
  AND v.prospect_user_id = e.enquirer_user_id
  AND v.status = 'VISITED'
  AND v.checked_in_at IS NOT NULL
  AND v.visit_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
  AND ((v.visit_date + 31)::timestamp AT TIME ZONE 'Asia/Kolkata') > CURRENT_TIMESTAMP
  AND e.status IN ('NEW', 'RESPONDED')
  AND e.expires_at > CURRENT_TIMESTAMP
  AND e.ended_at IS NULL
  AND e.replaced_at IS NULL
  AND e.chat_closed_at IS NULL
  AND e.window_closed_at IS NULL
  AND e.end_reason IS NULL;
