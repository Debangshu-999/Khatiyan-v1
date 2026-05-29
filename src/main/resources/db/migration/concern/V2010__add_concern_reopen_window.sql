ALTER TABLE concern.concerns
    ADD COLUMN reopen_until TIMESTAMPTZ,
    ADD COLUMN reopened BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN reopen_reason VARCHAR(1000),
    ADD COLUMN reopened_at TIMESTAMPTZ;

DROP INDEX IF EXISTS concern.idx_concerns_property_status;
DROP INDEX IF EXISTS concern.idx_concerns_raised_by_status;
DROP INDEX IF EXISTS concern.idx_concerns_assigned_to_status;

CREATE INDEX idx_concerns_property_status
    ON concern.concerns (property_id, status);

CREATE INDEX idx_concerns_raised_by_status
    ON concern.concerns (raised_by_user_id, status);

CREATE INDEX idx_concerns_assigned_to_status
    ON concern.concerns (assigned_to_user_id, status)
    WHERE assigned_to_user_id IS NOT NULL;

ALTER TABLE concern.concerns
    DROP COLUMN is_active;
