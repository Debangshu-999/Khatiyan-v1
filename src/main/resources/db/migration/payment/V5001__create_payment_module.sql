CREATE SCHEMA IF NOT EXISTS payment;

CREATE TABLE payment.payment_orders (
    id UUID PRIMARY KEY,

    billing_cycle_id UUID NOT NULL,
    tenancy_id UUID NOT NULL,
    tenant_user_id UUID NOT NULL,
    property_id UUID NOT NULL,

    amount_paise BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL,

    provider VARCHAR(30) NOT NULL,
    provider_order_id VARCHAR(120),
    provider_checkout_reference VARCHAR(255),

    status VARCHAR(30) NOT NULL,

    created_by_user_id UUID NOT NULL,
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason VARCHAR(500),

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_payment_orders_amount_positive
        CHECK (amount_paise > 0)
);

CREATE UNIQUE INDEX ux_payment_orders_provider_order_id
    ON payment.payment_orders (provider, provider_order_id)
    WHERE provider_order_id IS NOT NULL;

CREATE INDEX idx_payment_orders_billing_cycle_status
    ON payment.payment_orders (billing_cycle_id, status, created_at DESC);

CREATE INDEX idx_payment_orders_tenant_status
    ON payment.payment_orders (tenant_user_id, status, created_at DESC);

CREATE INDEX idx_payment_orders_property_created
    ON payment.payment_orders (property_id, created_at DESC);

CREATE TABLE payment.payment_transactions (
    id UUID PRIMARY KEY,

    payment_order_id UUID NOT NULL REFERENCES payment.payment_orders(id),
    provider VARCHAR(30) NOT NULL,

    provider_order_id VARCHAR(120),
    provider_payment_id VARCHAR(120),

    amount_paise BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL,

    status VARCHAR(30) NOT NULL,
    method VARCHAR(30),
    provider_status VARCHAR(80),

    failure_code VARCHAR(120),
    failure_reason VARCHAR(500),

    paid_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_payment_transactions_amount_positive
        CHECK (amount_paise > 0)
);

CREATE UNIQUE INDEX ux_payment_transactions_provider_payment_id
    ON payment.payment_transactions (provider, provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;

CREATE INDEX idx_payment_transactions_order_status
    ON payment.payment_transactions (payment_order_id, status, created_at DESC);

CREATE TABLE payment.payment_webhook_events (
    id UUID PRIMARY KEY,

    provider VARCHAR(30) NOT NULL,
    provider_event_id VARCHAR(160),
    event_type VARCHAR(120) NOT NULL,

    provider_order_id VARCHAR(120),
    provider_payment_id VARCHAR(120),

    payload_sha256 VARCHAR(64) NOT NULL,
    payload_json TEXT NOT NULL,

    signature VARCHAR(500),
    signature_valid BOOLEAN NOT NULL,
    processing_status VARCHAR(30) NOT NULL,

    processed_at TIMESTAMPTZ,
    failure_reason VARCHAR(500),

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX ux_payment_webhook_events_provider_event_id
    ON payment.payment_webhook_events (provider, provider_event_id)
    WHERE provider_event_id IS NOT NULL;

CREATE UNIQUE INDEX ux_payment_webhook_events_payload_hash
    ON payment.payment_webhook_events (provider, payload_sha256);

CREATE INDEX idx_payment_webhook_events_processing_status
    ON payment.payment_webhook_events (processing_status, created_at);
