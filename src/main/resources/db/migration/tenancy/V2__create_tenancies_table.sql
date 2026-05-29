CREATE TABLE IF NOT EXISTS tenancy.tenancies (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,
    property_id UUID NOT NULL,
    room_id UUID NOT NULL,

    rent_amount_paise BIGINT NOT NULL,
    deposit_amount_paise BIGINT NOT NULL,
    rent_due_day INT NOT NULL,

    start_date DATE NOT NULL,
    end_date DATE NULL,

    status VARCHAR(20) NOT NULL,
    exit_reason TEXT NULL,

    is_active BOOLEAN NOT NULL,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenancies_user_active
    ON tenancy.tenancies (user_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_tenancies_room_active
    ON tenancy.tenancies (room_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_tenancies_property_active
    ON tenancy.tenancies (property_id)
    WHERE is_active = TRUE;



