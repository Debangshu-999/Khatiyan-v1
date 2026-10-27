-- The leads pipeline follows a lead's bookings (2026-10-11). It finds them by
-- the enquiries they were raised from, a handful at a time for one lead and a
-- page's worth at a time for the leads list, so the lookup needs its index.
CREATE INDEX idx_booking_requests_enquiry
    ON booking.requests (enquiry_id);
