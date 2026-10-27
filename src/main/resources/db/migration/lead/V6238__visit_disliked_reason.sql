-- Why a visitor did not like the property (user, 2026-10-19): asked, and
-- required, when an external visit is recorded as disliked.
-- Immutable from first write: a correction is a later Flyway version.

ALTER TABLE lead.visits
    ADD COLUMN disliked_reason VARCHAR(500),
    ADD CONSTRAINT chk_visits_disliked_reason CHECK (disliked_reason IS NULL OR impression = 'DISLIKED');
