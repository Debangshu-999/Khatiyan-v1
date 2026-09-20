-- The owner's prepaid Service balance: what they have paid in advance, and
-- every movement of it.
--
-- This is a CLOSED balance by design. It buys Khatiyan services only — it
-- cannot be withdrawn, transferred, sent to another person, or spent on rent or
-- deposits. Those three properties are what keep it a closed-system prepaid
-- instrument, which RBI explicitly does not treat as a payment system requiring
-- authorisation. A feature that breaks any of them turns this into a regulated
-- product overnight, so they are enforced in code, not left to the UI.
--
-- Money is in paise as a BIGINT everywhere, matching billing.

CREATE SCHEMA IF NOT EXISTS servicebalance;

-- One account per owner. Not per property: an owner pays for verifications
-- across every building they run, and splitting the balance per property would
-- strand money in the building that happened to be topped up.
CREATE TABLE servicebalance.service_balance_accounts (
    id UUID NOT NULL,
    owner_user_id UUID NOT NULL,

    -- Spendable right now.
    available_paise BIGINT NOT NULL DEFAULT 0,
    -- Held against work that has been requested but not yet billed by the
    -- provider. Not spendable, not yet spent.
    reserved_paise BIGINT NOT NULL DEFAULT 0,

    -- Optimistic lock. Two verification requests racing for the last Rs 30 must
    -- not both succeed, and a lost update here is a real rupee.
    version BIGINT NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_service_balance_accounts PRIMARY KEY (id),
    CONSTRAINT uq_service_balance_accounts_owner UNIQUE (owner_user_id),
    -- The balance can never go negative by any path. Belt and braces with the
    -- entity's own guards, because this one is worth being paranoid about.
    CONSTRAINT ck_service_balance_available_non_negative CHECK (available_paise >= 0),
    CONSTRAINT ck_service_balance_reserved_non_negative CHECK (reserved_paise >= 0)
);

-- The ledger. Append-only: rows are never updated or deleted, and the two
-- counters on the account above are a cache of the sums here. The nightly
-- reconciliation recomputes from this table and shouts if they disagree.
--
-- Each row states BOTH deltas rather than one signed amount, because a reserve
-- moves money between the two counters without changing the total. With both,
-- reconciliation is a plain SUM and needs no knowledge of what each type means.
CREATE TABLE servicebalance.service_balance_entries (
    id UUID NOT NULL,
    account_id UUID NOT NULL,

    -- TOPUP, RESERVE, RELEASE, CHARGE, REFUND, ADJUSTMENT
    entry_type VARCHAR(20) NOT NULL,

    available_delta_paise BIGINT NOT NULL,
    reserved_delta_paise BIGINT NOT NULL,
    -- The resulting balances, so a statement line can be read on its own and an
    -- out-of-order replay is obvious rather than silent.
    available_after_paise BIGINT NOT NULL,
    reserved_after_paise BIGINT NOT NULL,

    -- What this movement was for: TOPUP, VERIFICATION or MANUAL.
    reference_type VARCHAR(20) NOT NULL,
    reference_id UUID,

    -- The one thing standing between a retried webhook and a double credit.
    -- Every write takes one, and the unique index is the enforcement.
    idempotency_key VARCHAR(120) NOT NULL,

    -- Shown on the owner's statement. Plain words, no jargon.
    memo VARCHAR(160),

    -- Null when the system moved the money (a webhook, a sweep).
    actor_user_id UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_service_balance_entries PRIMARY KEY (id),
    CONSTRAINT uq_service_balance_entries_idempotency UNIQUE (idempotency_key),
    CONSTRAINT fk_service_balance_entries_account
        FOREIGN KEY (account_id) REFERENCES servicebalance.service_balance_accounts (id)
);

-- The statement screen: newest first, for one account.
CREATE INDEX idx_service_balance_entries_account_created
    ON servicebalance.service_balance_entries (account_id, created_at DESC);

-- Everything that happened to one verification attempt, for support questions
-- of the form "why was I charged for this".
CREATE INDEX idx_service_balance_entries_reference
    ON servicebalance.service_balance_entries (reference_type, reference_id);

-- A top-up: the owner paying money in through the gateway.
--
-- Khatiyan sells its own service here, so Khatiyan is the merchant of record —
-- a plain gateway account, no split settlement, none of the third-party payout
-- rules that parked rent collection.
CREATE TABLE servicebalance.service_balance_top_ups (
    id UUID NOT NULL,
    account_id UUID NOT NULL,
    owner_user_id UUID NOT NULL,

    amount_paise BIGINT NOT NULL,
    -- CREATED, PAID, FAILED, EXPIRED
    status VARCHAR(20) NOT NULL,

    provider VARCHAR(20) NOT NULL,
    provider_order_id VARCHAR(100),
    -- Set once the gateway confirms. Also the credit's idempotency key, so the
    -- same payment can never be credited twice however often it is announced.
    provider_payment_id VARCHAR(100),

    failure_reason VARCHAR(200),
    paid_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_service_balance_top_ups PRIMARY KEY (id),
    CONSTRAINT uq_service_balance_top_ups_order UNIQUE (provider_order_id),
    CONSTRAINT uq_service_balance_top_ups_payment UNIQUE (provider_payment_id),
    CONSTRAINT ck_service_balance_top_up_amount_positive CHECK (amount_paise > 0),
    CONSTRAINT fk_service_balance_top_ups_account
        FOREIGN KEY (account_id) REFERENCES servicebalance.service_balance_accounts (id)
);

-- The owner's top-up history, newest first.
CREATE INDEX idx_service_balance_top_ups_owner_created
    ON servicebalance.service_balance_top_ups (owner_user_id, created_at DESC);

-- The sweep that expires abandoned checkouts.
CREATE INDEX idx_service_balance_top_ups_status_expires
    ON servicebalance.service_balance_top_ups (status, expires_at);
