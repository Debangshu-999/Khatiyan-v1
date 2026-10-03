-- Two reschedules before the visit date, and two more once it was missed
-- (owner's rule, 2026-10-03). Each is its own count, so a tenant can neither
-- keep moving a visit before its day nor keep moving a missed one.
--
-- tenant_reschedules keeps counting the moves made before the date.
ALTER TABLE lead.visits
    ADD COLUMN tenant_missed_reschedules INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT chk_visits_tenant_missed_reschedules
        CHECK (tenant_missed_reschedules BETWEEN 0 AND 2);

COMMENT ON COLUMN lead.visits.tenant_reschedules
    IS 'Moves the prospect made before the visit date. Two at most.';
COMMENT ON COLUMN lead.visits.tenant_missed_reschedules
    IS 'Moves the prospect made after missing the visit. Two at most.';
