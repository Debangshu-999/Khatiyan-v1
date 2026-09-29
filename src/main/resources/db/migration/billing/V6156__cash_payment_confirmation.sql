-- Cash payments confirmed by the tenant with a one-time code.
--
-- Cash leaves no trail of its own, so "the owner says it was paid" used to be
-- the whole record. Now the owner sends a code to the tenant's phone, the
-- tenant reads it out as they hand the money over, and only then is the bill
-- marked paid.
--
-- A code is bound to ONE bill at ONE amount. If the bill changes before the
-- code is entered — a late fee posts overnight, a charge is added — the code
-- no longer describes what would be recorded, and it is refused. The row is
-- kept either way: who asked for a code, for how much, and when, is the audit
-- trail behind a disputed cash payment.
CREATE TABLE IF NOT EXISTS billing.cash_payment_codes (
    id UUID PRIMARY KEY,
    billing_cycle_id UUID NOT NULL,
    amount_paise BIGINT NOT NULL,
    -- The number the code went to, resolved server-side from the bill. Kept so
    -- the check is made against the phone that actually received it, even if
    -- the tenant's number changes before the code is entered.
    phone VARCHAR(20) NOT NULL,
    requested_by_user_id UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_cash_payment_code_cycle
        FOREIGN KEY (billing_cycle_id)
        REFERENCES billing.billing_cycles (id),
    CONSTRAINT chk_cash_payment_code_amount_positive
        CHECK (amount_paise > 0)
);

CREATE INDEX IF NOT EXISTS idx_cash_payment_codes_cycle_requested
    ON billing.cash_payment_codes (billing_cycle_id, requested_at DESC);

-- When the tenant confirmed a cash payment with their code. Null on every other
-- method, and on cash recorded before this existed.
ALTER TABLE billing.billing_manual_payments
    ADD COLUMN tenant_confirmed_at TIMESTAMPTZ;
