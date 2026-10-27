-- When the visitor was told how to go on after their visit (2026-10-18): a
-- mail, or a push and in-app notice when they have no verified email. Sent
-- once, three hours after check-in. Null: not yet, or never will be.
--
-- Spec: docs/superpowers/specs/2026-10-18-visit-and-booking-mails-design.md
-- Immutable from first write: a correction is a later Flyway version.

ALTER TABLE lead.visits ADD COLUMN after_visit_told_at TIMESTAMPTZ;
