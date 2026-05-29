CREATE SCHEMA IF NOT EXISTS billing;

ALTER TABLE property.properties
    ADD COLUMN IF NOT EXISTS daily_late_fee_paise BIGINT;

ALTER TABLE property.properties
    DROP CONSTRAINT IF EXISTS chk_properties_daily_late_fee_non_negative;

ALTER TABLE property.properties
    ADD CONSTRAINT chk_properties_daily_late_fee_non_negative
        CHECK (daily_late_fee_paise IS NULL OR daily_late_fee_paise >= 0);

CREATE TABLE IF NOT EXISTS billing.billing_cycles (
    id UUID PRIMARY KEY,
    tenancy_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,
    tenant_name_snapshot VARCHAR(120) NOT NULL,
    property_id UUID NOT NULL,
    room_id UUID NOT NULL,
    billing_type VARCHAR(20) NOT NULL,
    cycle_number INTEGER NOT NULL,
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,
    rent_due_date DATE NOT NULL,
    base_amount_paise BIGINT NOT NULL DEFAULT 0,
    extra_charge_paise BIGINT NOT NULL DEFAULT 0,
    late_fee_amount_paise BIGINT NOT NULL DEFAULT 0,
    discount_amount_paise BIGINT NOT NULL DEFAULT 0,
    total_amount_paise BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_billing_cycles_billing_type
        CHECK (billing_type IN ('MONTHLY', 'DAILY')),

    CONSTRAINT chk_billing_cycles_status
        CHECK (status IN ('UNPAID', 'OVERDUE', 'PAID', 'CANCELLED')),

    CONSTRAINT chk_billing_cycles_cycle_number_positive
        CHECK (cycle_number > 0),

    CONSTRAINT chk_billing_cycles_period_order
        CHECK (period_end_date >= period_start_date),

    CONSTRAINT chk_billing_cycles_amounts_non_negative
        CHECK (
            base_amount_paise >= 0
            AND extra_charge_paise >= 0
            AND late_fee_amount_paise >= 0
            AND discount_amount_paise >= 0
            AND total_amount_paise >= 0
        ),

    CONSTRAINT uk_billing_cycles_tenancy_cycle
        UNIQUE (tenancy_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS idx_billing_cycles_property_status_due
    ON billing.billing_cycles (property_id, status, rent_due_date);

CREATE INDEX IF NOT EXISTS idx_billing_cycles_tenant_status_due
    ON billing.billing_cycles (tenant_user_id, status, rent_due_date);

CREATE INDEX IF NOT EXISTS idx_billing_cycles_tenancy_period
    ON billing.billing_cycles (tenancy_id, period_start_date, period_end_date);

CREATE TABLE IF NOT EXISTS billing.billing_cycle_line_items (
    id UUID PRIMARY KEY,
    billing_cycle_id UUID NOT NULL,
    type VARCHAR(30) NOT NULL,
    label VARCHAR(120) NOT NULL,
    description VARCHAR(500),
    amount_paise BIGINT NOT NULL,
    original_amount_paise BIGINT NOT NULL,
    settlement_action VARCHAR(40) NOT NULL,
    system_generated BOOLEAN NOT NULL,
    created_by_user_id UUID,
    last_adjusted_by_user_id UUID,
    display_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_billing_cycle_line_items_cycle
        FOREIGN KEY (billing_cycle_id)
        REFERENCES billing.billing_cycles (id),

    CONSTRAINT chk_billing_cycle_line_items_type
        CHECK (type IN ('RENT', 'DEPOSIT', 'DAILY_STAY', 'EXTRA_CHARGE', 'LATE_FEE', 'DISCOUNT')),

    CONSTRAINT chk_billing_cycle_line_items_settlement_action
        CHECK (settlement_action IN ('SYSTEM_CHARGE', 'ADDED_TO_BILL', 'ADJUSTED_FROM_DEPOSIT', 'WAIVED', 'DISCOUNTED')),

    CONSTRAINT chk_billing_cycle_line_items_amounts_non_negative
        CHECK (amount_paise >= 0 AND original_amount_paise >= 0),

    CONSTRAINT chk_billing_cycle_line_items_display_order_positive
        CHECK (display_order > 0)
);

CREATE INDEX IF NOT EXISTS idx_billing_cycle_line_items_cycle
    ON billing.billing_cycle_line_items (billing_cycle_id, display_order);

CREATE TABLE IF NOT EXISTS billing.deposit_accounts (
    id UUID PRIMARY KEY,
    tenancy_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,
    property_id UUID NOT NULL,
    original_deposit_amount_paise BIGINT NOT NULL,
    current_balance_paise BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uk_deposit_accounts_tenancy
        UNIQUE (tenancy_id),

    CONSTRAINT chk_deposit_accounts_status
        CHECK (status IN ('ACTIVE', 'SETTLED')),

    CONSTRAINT chk_deposit_accounts_amounts_non_negative
        CHECK (original_deposit_amount_paise >= 0 AND current_balance_paise >= 0)
);

CREATE INDEX IF NOT EXISTS idx_deposit_accounts_tenant_status
    ON billing.deposit_accounts (tenant_user_id, status);

CREATE INDEX IF NOT EXISTS idx_deposit_accounts_property_status
    ON billing.deposit_accounts (property_id, status);

CREATE TABLE IF NOT EXISTS billing.deposit_movements (
    id UUID PRIMARY KEY,
    deposit_account_id UUID NOT NULL,
    billing_cycle_id UUID,
    billing_cycle_line_item_id UUID,
    type VARCHAR(20) NOT NULL,
    reason VARCHAR(300) NOT NULL,
    amount_paise BIGINT NOT NULL,
    balance_after_paise BIGINT NOT NULL,
    created_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_deposit_movements_account
        FOREIGN KEY (deposit_account_id)
        REFERENCES billing.deposit_accounts (id),

    CONSTRAINT fk_deposit_movements_cycle
        FOREIGN KEY (billing_cycle_id)
        REFERENCES billing.billing_cycles (id),

    CONSTRAINT fk_deposit_movements_line_item
        FOREIGN KEY (billing_cycle_line_item_id)
        REFERENCES billing.billing_cycle_line_items (id),

    CONSTRAINT chk_deposit_movements_type
        CHECK (type IN ('DEDUCTION', 'ADDITION', 'SETTLEMENT')),

    CONSTRAINT chk_deposit_movements_amount_positive
        CHECK (amount_paise > 0),

    CONSTRAINT chk_deposit_movements_balance_non_negative
        CHECK (balance_after_paise >= 0)
);

CREATE INDEX IF NOT EXISTS idx_deposit_movements_account_created
    ON billing.deposit_movements (deposit_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing.bills (
    id UUID PRIMARY KEY,
    billing_cycle_id UUID NOT NULL,
    tenancy_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,
    tenant_name_snapshot VARCHAR(120) NOT NULL,
    property_id UUID NOT NULL,
    room_id UUID NOT NULL,
    bill_number VARCHAR(60) NOT NULL,
    billing_type VARCHAR(20) NOT NULL,
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL,
    rent_amount_paise BIGINT NOT NULL DEFAULT 0,
    daily_stay_amount_paise BIGINT NOT NULL DEFAULT 0,
    deposit_charged_paise BIGINT NOT NULL DEFAULT 0,
    extra_charge_amount_paise BIGINT NOT NULL DEFAULT 0,
    late_fee_amount_paise BIGINT NOT NULL DEFAULT 0,
    discount_amount_paise BIGINT NOT NULL DEFAULT 0,
    total_amount_paise BIGINT NOT NULL,
    paid_amount_paise BIGINT NOT NULL,
    old_deposit_balance_paise BIGINT NOT NULL DEFAULT 0,
    deposit_deducted_paise BIGINT NOT NULL DEFAULT 0,
    deposit_added_paise BIGINT NOT NULL DEFAULT 0,
    new_deposit_balance_paise BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_bills_billing_cycle
        FOREIGN KEY (billing_cycle_id)
        REFERENCES billing.billing_cycles (id),

    CONSTRAINT uk_bills_billing_cycle
        UNIQUE (billing_cycle_id),

    CONSTRAINT uk_bills_bill_number
        UNIQUE (bill_number),

    CONSTRAINT chk_bills_billing_type
        CHECK (billing_type IN ('MONTHLY', 'DAILY')),

    CONSTRAINT chk_bills_amounts_non_negative
        CHECK (
            rent_amount_paise >= 0
            AND daily_stay_amount_paise >= 0
            AND deposit_charged_paise >= 0
            AND extra_charge_amount_paise >= 0
            AND late_fee_amount_paise >= 0
            AND discount_amount_paise >= 0
            AND total_amount_paise >= 0
            AND paid_amount_paise >= 0
            AND old_deposit_balance_paise >= 0
            AND deposit_deducted_paise >= 0
            AND deposit_added_paise >= 0
            AND new_deposit_balance_paise >= 0
        )
);

CREATE INDEX IF NOT EXISTS idx_bills_property_paid_at
    ON billing.bills (property_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_bills_tenant_paid_at
    ON billing.bills (tenant_user_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS billing.bill_line_items (
    id UUID PRIMARY KEY,
    bill_id UUID NOT NULL,
    source_billing_cycle_line_item_id UUID,
    type VARCHAR(30) NOT NULL,
    label VARCHAR(120) NOT NULL,
    description VARCHAR(500),
    amount_paise BIGINT NOT NULL,
    original_amount_paise BIGINT NOT NULL,
    settlement_action VARCHAR(40) NOT NULL,
    display_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_bill_line_items_bill
        FOREIGN KEY (bill_id)
        REFERENCES billing.bills (id),

    CONSTRAINT fk_bill_line_items_source_cycle_line_item
        FOREIGN KEY (source_billing_cycle_line_item_id)
        REFERENCES billing.billing_cycle_line_items (id),

    CONSTRAINT chk_bill_line_items_type
        CHECK (type IN ('RENT', 'DEPOSIT', 'DAILY_STAY', 'EXTRA_CHARGE', 'LATE_FEE', 'DISCOUNT')),

    CONSTRAINT chk_bill_line_items_settlement_action
        CHECK (settlement_action IN ('SYSTEM_CHARGE', 'ADDED_TO_BILL', 'ADJUSTED_FROM_DEPOSIT', 'WAIVED', 'DISCOUNTED')),

    CONSTRAINT chk_bill_line_items_amounts_non_negative
        CHECK (amount_paise >= 0 AND original_amount_paise >= 0),

    CONSTRAINT chk_bill_line_items_display_order_positive
        CHECK (display_order > 0)
);

CREATE INDEX IF NOT EXISTS idx_bill_line_items_bill
    ON billing.bill_line_items (bill_id, display_order);
