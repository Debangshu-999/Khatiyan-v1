-- Razorpay Route payout: owner linked accounts + fee/split columns on orders.
-- All flag-gated (app.payment.route-enabled); dark until Route is live.

-- Owner payout account (Razorpay Route linked account). Only non-sensitive bank
-- fields are persisted (holder name, IFSC, last-4); the full account number is
-- sent to the gateway at creation time and never stored.
CREATE TABLE payment.owner_linked_accounts (
    id UUID PRIMARY KEY,
    owner_user_id UUID NOT NULL,
    account_holder_name VARCHAR(160) NOT NULL,
    account_number_last4 VARCHAR(4) NOT NULL,
    ifsc VARCHAR(16) NOT NULL,
    razorpay_account_id VARCHAR(120),
    status VARCHAR(16) NOT NULL,
    failure_reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uk_owner_linked_accounts_owner UNIQUE (owner_user_id),
    CONSTRAINT chk_owner_linked_accounts_status
        CHECK (status IN ('PENDING', 'ACTIVE', 'FAILED'))
);

-- Owner-borne fee split recorded per order (0 when Route is off). The tenant is
-- always charged amount_paise = rent; the owner receives owner_net_paise via a
-- Route transfer and the platform retains platform_fee_paise + gateway_fee_paise.
ALTER TABLE payment.payment_orders
    ADD COLUMN owner_user_id UUID,
    ADD COLUMN platform_fee_paise BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN gateway_fee_paise BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN owner_net_paise BIGINT NOT NULL DEFAULT 0;
