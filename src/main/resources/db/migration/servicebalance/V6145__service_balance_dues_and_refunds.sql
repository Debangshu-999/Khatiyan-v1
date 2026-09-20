-- Dues, refunds and disputes.
--
-- Three things arrive together because they are one rule between them: money
-- can be owed, money can go back, and money that is owed must go back to nobody
-- until it is settled.

-- ---------------------------------------------------------------- dues -----
--
-- The balance NEVER goes negative. A service run with nothing behind it is
-- recorded here instead, shown to the owner as pending charges, and taken out
-- of the next top-up before anything becomes spendable.
--
-- Deliberately not a negative available_paise: "spendable" and "owed" are
-- different questions, and one signed number answers neither well. A refund in
-- particular must never be able to pay out money that is really owed to us.
ALTER TABLE servicebalance.service_balance_accounts
    ADD COLUMN outstanding_paise BIGINT NOT NULL DEFAULT 0;

ALTER TABLE servicebalance.service_balance_accounts
    ADD CONSTRAINT ck_service_balance_outstanding_non_negative CHECK (outstanding_paise >= 0);

-- Set when the bank claws a payment back, or by hand. Locked means no new
-- spending, while work already in flight is honoured.
ALTER TABLE servicebalance.service_balance_accounts
    ADD COLUMN locked_at TIMESTAMPTZ;

ALTER TABLE servicebalance.service_balance_accounts
    ADD COLUMN locked_reason VARCHAR(200);

-- The ledger learns the third counter, for the same reason it carries two
-- already: a settlement moves money between available and outstanding, and one
-- signed figure cannot say which way.
ALTER TABLE servicebalance.service_balance_entries
    ADD COLUMN outstanding_delta_paise BIGINT NOT NULL DEFAULT 0;

ALTER TABLE servicebalance.service_balance_entries
    ADD COLUMN outstanding_after_paise BIGINT NOT NULL DEFAULT 0;

-- ------------------------------------------------------------- refunds -----
--
-- One row per gateway refund. A single request can produce several: money goes
-- back only to the payments that funded it, so a Rs 900 refund drawn from two
-- top-ups is two refunds at the gateway and two rows here.
CREATE TABLE servicebalance.service_balance_refunds (
    id UUID NOT NULL,
    account_id UUID NOT NULL,
    owner_user_id UUID NOT NULL,

    -- The lot this money is going back to, and therefore the card that gets it.
    top_up_id UUID NOT NULL,

    amount_paise BIGINT NOT NULL,
    -- REQUESTED, PROCESSED, FAILED
    status VARCHAR(20) NOT NULL,
    -- UNAPPLIED_PAYMENT, UNUSED_BALANCE, BILLING_ERROR
    reason VARCHAR(30) NOT NULL,

    provider_refund_id VARCHAR(100),
    failure_reason VARCHAR(200),
    processed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_service_balance_refunds PRIMARY KEY (id),
    CONSTRAINT uq_service_balance_refunds_provider UNIQUE (provider_refund_id),
    CONSTRAINT ck_service_balance_refund_amount_positive CHECK (amount_paise > 0),
    CONSTRAINT fk_service_balance_refunds_account
        FOREIGN KEY (account_id) REFERENCES servicebalance.service_balance_accounts (id),
    CONSTRAINT fk_service_balance_refunds_top_up
        FOREIGN KEY (top_up_id) REFERENCES servicebalance.service_balance_top_ups (id)
);

CREATE INDEX idx_service_balance_refunds_owner_created
    ON servicebalance.service_balance_refunds (owner_user_id, created_at DESC);
