-- Manual (offline) payment records captured by an owner/manager when a tenant
-- pays by cash, UPI, bank transfer, cheque, etc. outside the in-app gateway.
-- Each row records one collected payment for a billing cycle. Partial payments
-- are not supported yet: a manual payment covers the full cycle total and the
-- cycle is marked PAID in the same transaction.
CREATE TABLE IF NOT EXISTS billing.billing_manual_payments (
    id UUID PRIMARY KEY,
    billing_cycle_id UUID NOT NULL,
    tenancy_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,
    property_id UUID NOT NULL,
    amount_paise BIGINT NOT NULL,
    method VARCHAR(20) NOT NULL,
    reference_text VARCHAR(120),
    proof_image_url VARCHAR(600),
    note VARCHAR(500),
    collected_by_user_id UUID NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_manual_payment_cycle
        FOREIGN KEY (billing_cycle_id)
        REFERENCES billing.billing_cycles (id),
    CONSTRAINT chk_manual_payment_amount_positive
        CHECK (amount_paise > 0)
);

CREATE INDEX IF NOT EXISTS idx_manual_payments_cycle
    ON billing.billing_manual_payments (billing_cycle_id);

CREATE INDEX IF NOT EXISTS idx_manual_payments_property_collected_at
    ON billing.billing_manual_payments (property_id, collected_at);
