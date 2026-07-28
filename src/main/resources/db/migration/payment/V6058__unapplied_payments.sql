-- Money the gateway captured that could not be applied to a bill.
--
-- Rare by design: the bill was already settled some other way, the cycle was
-- cancelled, or the order was no longer payable by the time the tenant finished
-- checkout. Whatever the cause, every captured rupee must have a row on our side
-- explaining where it went — silently absorbing it, or throwing and recording
-- nothing, both leave money in the platform account with no trace.
--
-- These rows are the refund worklist, and later the dev dashboard's feed.
CREATE TABLE payment.unapplied_payments (
    id UUID PRIMARY KEY,
    payment_order_id UUID NOT NULL,
    billing_cycle_id UUID NOT NULL,
    tenancy_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,
    property_id UUID NOT NULL,

    provider VARCHAR(32) NOT NULL,
    provider_order_id VARCHAR(120),
    provider_payment_id VARCHAR(120),

    amount_paise BIGINT NOT NULL,
    currency VARCHAR(8) NOT NULL,

    reason VARCHAR(40) NOT NULL,
    status VARCHAR(24) NOT NULL,
    resolution_note VARCHAR(500),

    captured_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_unapplied_payments_reason CHECK (reason IN (
        'CYCLE_ALREADY_PAID',
        'CYCLE_CANCELLED',
        'ORDER_NOT_PAYABLE',
        'APPLY_FAILED'
    )),
    CONSTRAINT chk_unapplied_payments_status CHECK (status IN (
        'PENDING_REFUND',
        'REFUNDED',
        'WRITTEN_OFF'
    ))
);

-- One row per captured provider payment: webhook redelivery must not create
-- duplicate refund obligations.
CREATE UNIQUE INDEX uk_unapplied_payments_provider_payment
    ON payment.unapplied_payments (provider, provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;

CREATE INDEX idx_unapplied_payments_status ON payment.unapplied_payments (status);
CREATE INDEX idx_unapplied_payments_tenant ON payment.unapplied_payments (tenant_user_id);
