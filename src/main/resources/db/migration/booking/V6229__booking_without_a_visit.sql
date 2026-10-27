-- A stay booked straight from the property profile has no visit behind it
-- (user, 2026-10-17). Its two requests are counted per direct booking, which is
-- its enquiry, instead of per visit.
ALTER TABLE booking.requests
    ALTER COLUMN visit_id DROP NOT NULL;

CREATE UNIQUE INDEX uq_booking_requests_direct_slot
    ON booking.requests (enquiry_id, visit_slot)
    WHERE visit_id IS NULL AND visit_slot IS NOT NULL;
