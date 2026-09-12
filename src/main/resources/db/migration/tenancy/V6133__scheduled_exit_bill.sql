-- A scheduled exit that bills charges raises its exit bill 24 hours after it is
-- saved. Until then the charges live only on the schedule and can be changed or
-- dropped freely. Once the bill is raised it is the tenant's to pay, the
-- schedule can no longer be removed, and only its deposit side can change.

ALTER TABLE tenancy.scheduled_tenancy_exits
    ADD COLUMN bill_publish_at TIMESTAMPTZ,
    ADD COLUMN exit_bill_id UUID;

CREATE INDEX idx_scheduled_tenancy_exits_bill_publish
    ON tenancy.scheduled_tenancy_exits (bill_publish_at)
    WHERE status = 'SCHEDULED' AND exit_bill_id IS NULL AND bill_publish_at IS NOT NULL;
