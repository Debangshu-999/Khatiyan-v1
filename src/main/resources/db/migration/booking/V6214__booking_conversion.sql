-- A confirmed booking becomes a stay.
--
-- Plan: docs/superpowers/plans/2026-10-07-post-visit-bookings.md, chunk 6B.
-- Immutable from first write: a correction is a later Flyway version.
--
-- The property converts a booking when the tenant arrives (user, 2026-10-10).
-- It is ordinary onboarding, with the booked bed passing to the new stay, and
-- the booking keeps that stay's id. When the tenant signs and the stay
-- starts, the booking is over: MOVED_IN. If the stay falls through before
-- that, the booking is cancelled with the reason.

ALTER TABLE booking.requests
    -- tenancy.tenancies.id. No FK: cross-module.
    ADD COLUMN tenancy_id UUID,
    ADD COLUMN converted_at TIMESTAMPTZ,
    -- auth.users.id. No FK: cross-module.
    ADD COLUMN converted_by_user_id UUID;

ALTER TABLE booking.requests
    DROP CONSTRAINT chk_booking_requests_status,
    DROP CONSTRAINT chk_booking_requests_closed;

ALTER TABLE booking.requests
    ADD CONSTRAINT chk_booking_requests_status
        CHECK (status IN ('AWAITING_HANDLER', 'AWAITING_TENANT', 'AWAITING_TOKEN',
                          'CONFIRMED', 'CANCELLED', 'EXPIRED', 'MOVED_IN')),
    -- Over means it has a time. Open means it has none.
    ADD CONSTRAINT chk_booking_requests_closed
        CHECK ((status IN ('CANCELLED', 'EXPIRED', 'MOVED_IN')) = (closed_at IS NOT NULL)),
    -- Converted is all or nothing: the stay, who converted it and when.
    ADD CONSTRAINT chk_booking_requests_converted_complete
        CHECK ((tenancy_id IS NULL AND converted_at IS NULL AND converted_by_user_id IS NULL)
            OR (tenancy_id IS NOT NULL AND converted_at IS NOT NULL AND converted_by_user_id IS NOT NULL)),
    -- Only a confirmed booking is converted. It then moves in, or is cancelled
    -- when the stay falls through.
    ADD CONSTRAINT chk_booking_requests_converted_states
        CHECK (tenancy_id IS NULL OR status IN ('CONFIRMED', 'MOVED_IN', 'CANCELLED')),
    -- Moved in means a stay, a confirmation before it, and that as the reason it ended.
    ADD CONSTRAINT chk_booking_requests_moved_in
        CHECK (status <> 'MOVED_IN'
            OR (tenancy_id IS NOT NULL AND confirmed_at IS NOT NULL
                AND end_cause IS NOT NULL AND end_cause = 'MOVED_IN'));

-- One booking per stay.
CREATE UNIQUE INDEX uq_booking_requests_tenancy
    ON booking.requests (tenancy_id)
    WHERE tenancy_id IS NOT NULL;
