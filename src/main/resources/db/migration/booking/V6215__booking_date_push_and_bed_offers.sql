-- The one move-in date push, and another bed for a tenant whose booked bed is
-- not ready.
--
-- Plan: docs/superpowers/plans/2026-10-07-post-visit-bookings.md, chunks 6 and 6B.
-- Immutable from first write: a correction is a later Flyway version.

ALTER TABLE booking.requests
    -- When the tenant pushed the move-in date. Null while it is the date they asked for.
    ADD COLUMN move_in_pushed_at TIMESTAMPTZ;

ALTER TABLE booking.requests
    -- Pushed once, to a later day, by seven days at most (user, 2026-10-10).
    -- Not pushed means the date is still the one asked for.
    ADD CONSTRAINT chk_booking_requests_date_push
        CHECK ((move_in_pushed_at IS NULL) = (move_in_date = original_move_in_date)
           AND move_in_date <= original_move_in_date + 7);

-- A bed the property offers in place of one that is still occupied past the
-- move-in day. The tenant takes it or does not. Taking it moves the booking
-- to that room at that rent, and the token already received carries over.
CREATE TABLE booking.bed_offers (
    id UUID NOT NULL,
    request_id UUID NOT NULL,
    sequence INTEGER NOT NULL,
    -- property.rooms.id. No FK: cross-module.
    room_id UUID NOT NULL,
    room_number VARCHAR(40) NOT NULL,
    monthly_rent_paise BIGINT NOT NULL,
    -- auth.users.id. No FK: cross-module.
    offered_by_user_id UUID NOT NULL,
    offered_at TIMESTAMPTZ NOT NULL,
    -- Null while the tenant has not answered. REPLACED: the property made a newer offer.
    answer VARCHAR(15),
    answered_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_booking_bed_offers PRIMARY KEY (id),
    CONSTRAINT uq_booking_bed_offers_sequence UNIQUE (request_id, sequence),
    CONSTRAINT fk_booking_bed_offers_request
        FOREIGN KEY (request_id)
        REFERENCES booking.requests (id)
        ON DELETE CASCADE,
    CONSTRAINT chk_booking_bed_offers_sequence CHECK (sequence >= 1),
    CONSTRAINT chk_booking_bed_offers_rent CHECK (monthly_rent_paise > 0),
    CONSTRAINT chk_booking_bed_offers_answer
        CHECK (answer IS NULL OR answer IN ('ACCEPTED', 'DECLINED', 'REPLACED')),
    CONSTRAINT chk_booking_bed_offers_answered
        CHECK ((answer IS NULL) = (answered_at IS NULL))
);

-- One offer is on the table at a time.
CREATE UNIQUE INDEX uq_booking_bed_offers_open
    ON booking.bed_offers (request_id)
    WHERE answer IS NULL;
