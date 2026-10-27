-- A visit or a stay booked straight from the property profile (user, 2026-10-17,
-- docs/superpowers/specs/2026-10-17-direct-visit-and-booking-design.md).
--
-- origin             how the record began: an enquiry, or a visit or stay booked
--                    directly. A direct record carries the shared contact, the
--                    handler and the chat, and is never listed as an enquiry.
-- direct_booking_at  when the person chose to book a stay without a visit. The
--                    booking window is then open with no attended visit.
ALTER TABLE enquiry.enquiries
    ADD COLUMN origin VARCHAR(20) NOT NULL DEFAULT 'ENQUIRY',
    ADD COLUMN direct_booking_at TIMESTAMPTZ;

ALTER TABLE enquiry.enquiries
    ADD CONSTRAINT chk_enquiries_origin CHECK (origin IN ('ENQUIRY', 'DIRECT_VISIT', 'DIRECT_BOOKING'));

-- A direct booking's window can be closed by the tenant's own cancellation, as a
-- window after a visit is, with no visit behind it.
ALTER TABLE enquiry.enquiries
    DROP CONSTRAINT chk_enquiry_post_visit_source;

ALTER TABLE enquiry.enquiries
    ADD CONSTRAINT chk_enquiry_post_visit_source CHECK (
        (booking_visit_id IS NULL AND booking_visit_date IS NULL AND pre_visit_expires_at IS NULL
            AND (booking_window_closed_at IS NULL OR direct_booking_at IS NOT NULL))
        OR (booking_visit_id IS NOT NULL AND booking_visit_date IS NOT NULL
            AND pre_visit_expires_at IS NOT NULL));
