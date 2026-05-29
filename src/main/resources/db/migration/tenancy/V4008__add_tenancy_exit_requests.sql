ALTER TABLE property.properties
    ADD COLUMN IF NOT EXISTS standard_deposit_paise BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS notice_period_days INTEGER NOT NULL DEFAULT 30;

ALTER TABLE property.properties
    DROP CONSTRAINT IF EXISTS chk_properties_standard_deposit_non_negative;

ALTER TABLE property.properties
    ADD CONSTRAINT chk_properties_standard_deposit_non_negative
        CHECK (standard_deposit_paise >= 0);

ALTER TABLE property.properties
    DROP CONSTRAINT IF EXISTS chk_properties_notice_period_days;

ALTER TABLE property.properties
    ADD CONSTRAINT chk_properties_notice_period_days
        CHECK (notice_period_days BETWEEN 0 AND 365);

ALTER TABLE tenancy.tenancies
    DROP CONSTRAINT IF EXISTS chk_tenancies_status;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_status
        CHECK (status IN ('ACTIVE', 'ON_NOTICE', 'ON_PREMATURE_NOTICE', 'EXITED', 'EVICTED'));

CREATE TABLE IF NOT EXISTS tenancy.tenancy_exit_requests (
    id UUID PRIMARY KEY,
    tenancy_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,
    property_id UUID NOT NULL,
    room_id UUID NOT NULL,
    type VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    requested_checkout_date DATE NOT NULL,
    approved_checkout_date DATE,
    tenant_reason VARCHAR(500),
    admin_notes VARCHAR(500),
    final_billing_amount_paise BIGINT,
    deposit_payable BOOLEAN,
    deposit_settlement_amount_paise BIGINT,
    decided_by_user_id UUID,
    decided_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_tenancy_exit_requests_type
        CHECK (type IN ('NORMAL_NOTICE', 'PREMATURE')),

    CONSTRAINT chk_tenancy_exit_requests_status
        CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXECUTED')),

    CONSTRAINT chk_tenancy_exit_requests_amounts_non_negative
        CHECK (
            (final_billing_amount_paise IS NULL OR final_billing_amount_paise >= 0)
            AND (deposit_settlement_amount_paise IS NULL OR deposit_settlement_amount_paise >= 0)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_tenancy_exit_requests_one_open
    ON tenancy.tenancy_exit_requests (tenancy_id)
    WHERE status IN ('REQUESTED', 'APPROVED');

CREATE INDEX IF NOT EXISTS idx_tenancy_exit_requests_tenant_status
    ON tenancy.tenancy_exit_requests (tenant_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenancy_exit_requests_property_status
    ON tenancy.tenancy_exit_requests (property_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenancy_exit_requests_due_execution
    ON tenancy.tenancy_exit_requests (status, approved_checkout_date)
    WHERE status = 'APPROVED';
