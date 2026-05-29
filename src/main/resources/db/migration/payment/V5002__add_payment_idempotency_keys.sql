CREATE TABLE payment.payment_idempotency_keys (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,
    operation VARCHAR(80) NOT NULL,
    idempotency_key VARCHAR(120) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,

    status VARCHAR(30) NOT NULL,
    payment_order_id UUID REFERENCES payment.payment_orders(id),

    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason VARCHAR(500),

    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX ux_payment_idempotency_keys_user_operation_key
    ON payment.payment_idempotency_keys (user_id, operation, idempotency_key);

CREATE INDEX idx_payment_idempotency_keys_status_created
    ON payment.payment_idempotency_keys (status, created_at);

CREATE INDEX idx_payment_idempotency_keys_payment_order
    ON payment.payment_idempotency_keys (payment_order_id)
    WHERE payment_order_id IS NOT NULL;
