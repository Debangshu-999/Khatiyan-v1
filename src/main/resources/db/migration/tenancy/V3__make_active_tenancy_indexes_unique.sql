DROP INDEX IF EXISTS tenancy.idx_tenancies_user_active;
DROP INDEX IF EXISTS tenancy.idx_tenancies_room_active;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tenancies_user_active
    ON tenancy.tenancies (user_id)
    WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tenancies_room_active
    ON tenancy.tenancies (room_id)
    WHERE is_active = TRUE;
