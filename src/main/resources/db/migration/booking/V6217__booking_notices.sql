-- What a booking has already told people, so nothing is said twice.
--
-- Plan: docs/superpowers/plans/2026-10-07-post-visit-bookings.md, chunk 7.
-- Immutable from first write: a correction is a later Flyway version.
--
-- The first kind is BED_NOT_FREE: on the move-in day and the three after it,
-- the property is told once a day that a booked bed must be freed for a
-- booking to start. A row here is that day's telling.

CREATE TABLE booking.notices (
    id UUID NOT NULL,
    request_id UUID NOT NULL,
    kind VARCHAR(40) NOT NULL,
    -- The day the notice is about, on the property's calendar (IST).
    notice_date DATE NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_booking_notices PRIMARY KEY (id),
    CONSTRAINT fk_booking_notices_request
        FOREIGN KEY (request_id)
        REFERENCES booking.requests (id)
        ON DELETE CASCADE,
    -- One telling of a kind per booking per day.
    CONSTRAINT uq_booking_notices UNIQUE (request_id, kind, notice_date)
);
