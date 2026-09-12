-- A scheduled exit runs once. A run that cannot complete closes the schedule as
-- FAILED and the exit goes back to a person, instead of retrying every day.
ALTER TABLE tenancy.scheduled_tenancy_exits
    DROP CONSTRAINT IF EXISTS chk_scheduled_tenancy_exits_status;

ALTER TABLE tenancy.scheduled_tenancy_exits
    ADD CONSTRAINT chk_scheduled_tenancy_exits_status
        CHECK (status IN ('SCHEDULED', 'COMPLETED', 'REVERSED', 'UNSCHEDULED', 'FAILED'));

-- The shape of execution_payload, so a schedule saved before a change to the
-- end-tenancy command is recognised instead of misread.
ALTER TABLE tenancy.scheduled_tenancy_exits
    ADD COLUMN IF NOT EXISTS payload_version INTEGER NOT NULL DEFAULT 1;

-- The selected damage items as priced when the exit was saved, compared again
-- when it runs. Null on schedules saved before this was recorded.
ALTER TABLE tenancy.scheduled_tenancy_exits
    ADD COLUMN IF NOT EXISTS priced_damage_total_paise BIGINT;

-- Upcoming exits shows the latest failed schedule for an exit that has none active.
CREATE INDEX IF NOT EXISTS idx_scheduled_tenancy_exits_property_failed
    ON tenancy.scheduled_tenancy_exits (property_id, closed_at DESC)
    WHERE status = 'FAILED';
