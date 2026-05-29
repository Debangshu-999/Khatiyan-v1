DROP INDEX IF EXISTS tenancy.ux_tenancies_room_active;

CREATE INDEX IF NOT EXISTS idx_tenancies_room_active
    ON tenancy.tenancies (room_id)
    WHERE is_active = TRUE;
