-- The order a request's history was written in.
--
-- Plan: docs/superpowers/plans/2026-10-07-post-visit-bookings.md, chunk 6.
-- Immutable from first write: a correction is a later Flyway version.
--
-- Two things can happen to a request in one instant and carry the same
-- occurred_at: terms agreed and the booking confirmed, a request sent and its
-- handler assigned. Until now created_at and then the random id broke that
-- tie, which is no order at all when both rows are written inside the same
-- millisecond. The database now numbers the rows as they arrive.
--
-- Rows written before this get their numbers in whatever order the table
-- holds them, which is no worse than the tie-break they had.

ALTER TABLE booking.actions
    ADD COLUMN seq BIGINT GENERATED ALWAYS AS IDENTITY;

DROP INDEX booking.idx_booking_actions_request;

CREATE INDEX idx_booking_actions_request
    ON booking.actions (request_id, occurred_at, seq);
