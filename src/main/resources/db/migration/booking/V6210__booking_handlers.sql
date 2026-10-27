-- Who handles a booking request, and how a property chooses them.
--
-- Plan: docs/superpowers/plans/2026-10-07-post-visit-bookings.md, chunk 5.
-- Immutable from first write: a correction is a later Flyway version.
--
-- Who may see a property's bookings at all is not stored here. It is the
-- ordinary BOOKINGS grant in property.manager_permissions, set from the
-- bookings access list. The owner always can.

ALTER TABLE booking.settings
    -- FIRST_VIEW: the first manager to open a request's details handles it.
    -- SYSTEM_TURNS: each new request goes to the next manager in turn.
    ADD COLUMN assignment_mode VARCHAR(20) NOT NULL DEFAULT 'FIRST_VIEW',
    -- Whether the owner takes a turn of their own. With no manager to give a
    -- request to, the owner gets it whatever this says.
    ADD COLUMN include_owner_in_turns BOOLEAN NOT NULL DEFAULT FALSE,
    -- Who got the last turn. The next goes to whoever follows them now, so
    -- turns stay even when a manager joins or leaves between two requests.
    ADD COLUMN last_assigned_user_id UUID,
    ADD CONSTRAINT chk_booking_settings_assignment_mode
        CHECK (assignment_mode IN ('FIRST_VIEW', 'SYSTEM_TURNS'));

ALTER TABLE booking.requests
    -- auth.users.id of whoever handles it. Null while nobody does. No FK:
    -- cross-module.
    ADD COLUMN handler_user_id UUID,
    ADD COLUMN handler_assigned_by VARCHAR(20),
    ADD COLUMN handler_assigned_at TIMESTAMPTZ,
    ADD CONSTRAINT chk_booking_requests_handler_assigned_by
        CHECK (handler_assigned_by IS NULL OR handler_assigned_by IN ('FIRST_VIEW', 'SYSTEM')),
    -- A handler comes with how and when they got it. No handler has neither.
    ADD CONSTRAINT chk_booking_requests_handler_complete
        CHECK ((handler_user_id IS NULL AND handler_assigned_by IS NULL AND handler_assigned_at IS NULL)
            OR (handler_user_id IS NOT NULL AND handler_assigned_by IS NOT NULL
                AND handler_assigned_at IS NOT NULL));

-- A manager's own requests, and the ones to hand on when a manager leaves.
CREATE INDEX idx_booking_requests_property_handler
    ON booking.requests (property_id, handler_user_id)
    WHERE handler_user_id IS NOT NULL;
