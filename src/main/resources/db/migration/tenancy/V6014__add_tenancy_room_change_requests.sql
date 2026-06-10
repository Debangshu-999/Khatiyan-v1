CREATE TABLE IF NOT EXISTS tenancy.tenancy_room_change_requests (
    id UUID PRIMARY KEY,
    tenancy_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,
    property_id UUID NOT NULL,
    current_room_id UUID NOT NULL,
    target_room_id UUID NOT NULL,
    billing_cycle_id UUID NOT NULL,
    status VARCHAR(30) NOT NULL,
    effective_transfer_date DATE NOT NULL,
    tenant_reason VARCHAR(500),
    admin_notes VARCHAR(500),
    requested_room_rent_amount_paise BIGINT NOT NULL,
    executed_rent_amount_paise BIGINT,
    decided_by_user_id UUID,
    decided_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_tenancy_room_change_requests_status
        CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXECUTED')),

    CONSTRAINT chk_tenancy_room_change_requests_room_changed
        CHECK (current_room_id <> target_room_id),

    CONSTRAINT chk_tenancy_room_change_requests_rent_positive
        CHECK (
            requested_room_rent_amount_paise > 0
            AND (executed_rent_amount_paise IS NULL OR executed_rent_amount_paise > 0)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_tenancy_room_change_requests_one_open
    ON tenancy.tenancy_room_change_requests (tenancy_id)
    WHERE status IN ('REQUESTED', 'APPROVED');

CREATE INDEX IF NOT EXISTS idx_tenancy_room_change_requests_tenant_status
    ON tenancy.tenancy_room_change_requests (tenant_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenancy_room_change_requests_property_status
    ON tenancy.tenancy_room_change_requests (property_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenancy_room_change_requests_due_execution
    ON tenancy.tenancy_room_change_requests (status, effective_transfer_date)
    WHERE status = 'APPROVED';
