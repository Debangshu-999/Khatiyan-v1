ALTER TABLE tenancy.tenancy_room_change_requests
    ADD COLUMN IF NOT EXISTS superseded_request_id UUID;

ALTER TABLE tenancy.tenancy_room_change_requests
    DROP CONSTRAINT IF EXISTS fk_room_change_request_superseded;

ALTER TABLE tenancy.tenancy_room_change_requests
    ADD CONSTRAINT fk_room_change_request_superseded
        FOREIGN KEY (superseded_request_id)
        REFERENCES tenancy.tenancy_room_change_requests (id);

ALTER TABLE tenancy.tenancy_room_change_requests
    DROP CONSTRAINT IF EXISTS chk_room_change_request_not_self_superseded;

ALTER TABLE tenancy.tenancy_room_change_requests
    ADD CONSTRAINT chk_room_change_request_not_self_superseded
        CHECK (superseded_request_id IS NULL OR superseded_request_id <> id);

CREATE INDEX IF NOT EXISTS idx_room_change_request_superseded
    ON tenancy.tenancy_room_change_requests (superseded_request_id)
    WHERE superseded_request_id IS NOT NULL;

-- Preserve only decisions whose new three-day interaction/visibility window is
-- still genuinely open. Old history must not be revived by this migration.
UPDATE tenancy.tenancy_room_change_requests
SET expires_at = decided_at + INTERVAL '3 days'
WHERE status IN ('APPROVED', 'REJECTED')
  AND decided_at IS NOT NULL
  AND decided_at + INTERVAL '3 days' > NOW();
