-- The record of money leaving the platform for an owner.
--
-- Transfers are created after capture, not declared on the order, so the fee
-- passed on is the one Razorpay actually charged for that payment rather than an
-- estimate. Every deduction is stored, because this row is what the owner's
-- payment receipt is rendered from.
CREATE TABLE payment.owner_transfers (
    id UUID PRIMARY KEY,

    billing_cycle_id UUID NOT NULL,
    payment_order_id UUID NOT NULL,
    tenancy_id UUID NOT NULL,
    property_id UUID NOT NULL,
    owner_user_id UUID NOT NULL,

    provider VARCHAR(32) NOT NULL,
    provider_payment_id VARCHAR(120),
    provider_transfer_id VARCHAR(120),
    linked_account_ref VARCHAR(120) NOT NULL,

    -- gross = gateway_fee + platform_fee + owner_net. gateway_tax is the GST
    -- portion already inside gateway_fee, split out for the receipt.
    gross_amount_paise BIGINT NOT NULL,
    gateway_fee_paise BIGINT NOT NULL,
    gateway_tax_paise BIGINT NOT NULL,
    platform_fee_paise BIGINT NOT NULL,
    owner_net_paise BIGINT NOT NULL,
    currency VARCHAR(8) NOT NULL,

    status VARCHAR(24) NOT NULL,
    failure_reason VARCHAR(500),

    initiated_at TIMESTAMPTZ NOT NULL,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_owner_transfers_status CHECK (status IN (
        'PENDING',
        'PROCESSED',
        'SETTLED',
        'FAILED'
    ))
);

-- The reason this table exists. One transfer per billing cycle, enforced by the
-- database: if a cycle is somehow paid twice, the second payment cannot pay the
-- owner again. It is held for tenant refund instead.
CREATE UNIQUE INDEX uk_owner_transfers_cycle
    ON payment.owner_transfers (billing_cycle_id);

-- Webhook redelivery must not duplicate a transfer record.
CREATE UNIQUE INDEX uk_owner_transfers_provider_transfer
    ON payment.owner_transfers (provider, provider_transfer_id)
    WHERE provider_transfer_id IS NOT NULL;

CREATE INDEX idx_owner_transfers_owner ON payment.owner_transfers (owner_user_id);
CREATE INDEX idx_owner_transfers_status ON payment.owner_transfers (status);
