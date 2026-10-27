-- One booking can be told the same kind of thing more than once a day when
-- each telling is about a different thing (2026-10-19): a reminder per offer
-- in the negotiation, or per token claim. subject_key says which ('' when
-- the kind needs none), and the unique key takes it in, so each is still said
-- once.
--
-- Spec: docs/superpowers/plans/2026-10-07-post-visit-bookings.md, chunk 7.
-- Immutable from first write: a correction is a later Flyway version.

ALTER TABLE booking.notices ADD COLUMN subject_key VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE booking.notices DROP CONSTRAINT uq_booking_notices;
ALTER TABLE booking.notices
    ADD CONSTRAINT uq_booking_notices UNIQUE (request_id, kind, notice_date, subject_key);
