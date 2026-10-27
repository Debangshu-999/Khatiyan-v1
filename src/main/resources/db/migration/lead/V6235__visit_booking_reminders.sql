-- The twice-weekly reminder to book after a visit (2026-10-19): Tuesday and
-- Friday at 10 am, while the visit's booking window is open and nothing is
-- booked from it. One row per visit and day, so a day's reminder goes once.
--
-- Spec: docs/superpowers/plans/2026-10-07-post-visit-bookings.md, chunk 7.
-- Immutable from first write: a correction is a later Flyway version.

CREATE TABLE lead.visit_booking_reminders (
    visit_id UUID NOT NULL REFERENCES lead.visits (id) ON DELETE CASCADE,
    reminder_date DATE NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (visit_id, reminder_date)
);
