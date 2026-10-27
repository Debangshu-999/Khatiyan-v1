-- The booking token: what each side says about money that never passes
-- through the app. The tenant pays the property directly, and these tables
-- record the claim, the receipt and any refund.
--
-- Plan: docs/superpowers/plans/2026-10-07-post-visit-bookings.md, chunk 6A.
-- Immutable from first write: a correction is a later Flyway version.
--
-- A token row exists only where a token is owed: it is written when terms are
-- agreed at a property that takes one. The token's clock is not here.
-- token_due_at and token_claim_waiting stay on booking.requests, where the
-- lists and the sweep read them without a join.

CREATE TABLE booking.tokens (
    id UUID NOT NULL,
    request_id UUID NOT NULL,
    -- property.properties.id. No FK: cross-module. Kept here so "does this
    -- property owe a refund" is one indexed read.
    property_id UUID NOT NULL,
    -- What was owed when terms were agreed. It never changes.
    amount_paise BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,

    -- The property's record that the money arrived.
    received_method VARCHAR(20),
    received_reference VARCHAR(60),
    -- auth.users.id. No FK: cross-module.
    received_by_user_id UUID,
    received_at TIMESTAMPTZ,
    -- The receipt's short code, shown to both sides.
    receipt_code VARCHAR(40),

    -- The owner chose to hold this bed without a token after all.
    waived_by_user_id UUID,
    waived_at TIMESTAMPTZ,

    -- Since when the property has owed it back. A refund the tenant says did
    -- not arrive keeps its first date, so "sent" cannot restart the count.
    refund_due_since TIMESTAMPTZ,
    refund_method VARCHAR(20),
    refund_reference VARCHAR(60),
    refund_proof_url VARCHAR(500),
    refund_sent_by_user_id UUID,
    refund_sent_at TIMESTAMPTZ,
    refund_confirmed_at TIMESTAMPTZ,
    refund_disputed_at TIMESTAMPTZ,

    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_booking_tokens PRIMARY KEY (id),
    -- One token per booking.
    CONSTRAINT uq_booking_tokens_request UNIQUE (request_id),
    CONSTRAINT uq_booking_tokens_receipt_code UNIQUE (receipt_code),
    CONSTRAINT fk_booking_tokens_request
        FOREIGN KEY (request_id)
        REFERENCES booking.requests (id)
        ON DELETE CASCADE,
    CONSTRAINT chk_booking_tokens_amount CHECK (amount_paise > 0),
    CONSTRAINT chk_booking_tokens_status
        CHECK (status IN ('NOT_REQUIRED', 'DUE', 'CLAIMED', 'NOT_RECEIVED', 'RECEIVED',
                          'ADJUSTED', 'KEPT', 'REFUND_DUE', 'REFUND_SENT', 'REFUNDED')),
    CONSTRAINT chk_booking_tokens_received_method
        CHECK (received_method IS NULL
            OR received_method IN ('CASH', 'UPI', 'CARD', 'CHEQUE', 'OTHER', 'BANK_TRANSFER')),
    CONSTRAINT chk_booking_tokens_refund_method
        CHECK (refund_method IS NULL
            OR refund_method IN ('CASH', 'UPI', 'CARD', 'CHEQUE', 'OTHER', 'BANK_TRANSFER')),
    -- A receipt is all or nothing: a method, a person, a time and a code.
    CONSTRAINT chk_booking_tokens_received_complete
        CHECK ((received_at IS NULL AND received_method IS NULL AND received_by_user_id IS NULL
                AND receipt_code IS NULL AND received_reference IS NULL)
            OR (received_at IS NOT NULL AND received_method IS NOT NULL AND received_by_user_id IS NOT NULL
                AND receipt_code IS NOT NULL)),
    -- Only money that arrived can be held, adjusted, kept or owed back.
    CONSTRAINT chk_booking_tokens_received_states
        CHECK ((status IN ('RECEIVED', 'ADJUSTED', 'KEPT', 'REFUND_DUE', 'REFUND_SENT', 'REFUNDED'))
             = (received_at IS NOT NULL)),
    -- A row reads "not required" only because the owner waived it.
    CONSTRAINT chk_booking_tokens_waived
        CHECK ((status = 'NOT_REQUIRED') = (waived_at IS NOT NULL)
           AND (waived_at IS NULL) = (waived_by_user_id IS NULL)),
    CONSTRAINT chk_booking_tokens_refund_due_since
        CHECK ((status IN ('REFUND_DUE', 'REFUND_SENT', 'REFUNDED')) = (refund_due_since IS NOT NULL)),
    -- A refund the property says it sent has a method, a person and a time.
    -- One the tenant disputed is owed again and keeps what was said.
    CONSTRAINT chk_booking_tokens_refund_sent
        CHECK (status NOT IN ('REFUND_SENT', 'REFUNDED')
            OR (refund_sent_at IS NOT NULL AND refund_method IS NOT NULL AND refund_sent_by_user_id IS NOT NULL)),
    CONSTRAINT chk_booking_tokens_refunded
        CHECK ((status = 'REFUNDED') = (refund_confirmed_at IS NOT NULL))
);

-- The one lever the app has: a refund left owed stops new tokens at the property.
CREATE INDEX idx_booking_tokens_refund_due
    ON booking.tokens (property_id, refund_due_since)
    WHERE status = 'REFUND_DUE';

-- The tenant's "I've paid", and the property's answer. A claim is answered
-- once and never edited. Cash is not claimed: the property records it.
CREATE TABLE booking.token_claims (
    id UUID NOT NULL,
    token_id UUID NOT NULL,
    sequence INTEGER NOT NULL,
    method VARCHAR(20) NOT NULL,
    reference VARCHAR(60),
    proof_url_1 VARCHAR(500),
    proof_url_2 VARCHAR(500),
    -- auth.users.id. No FK: cross-module.
    claimed_by_user_id UUID NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL,
    -- Null while the property has not answered.
    answer VARCHAR(15),
    answer_reason VARCHAR(500),
    answered_by_user_id UUID,
    answered_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_booking_token_claims PRIMARY KEY (id),
    CONSTRAINT uq_booking_token_claims_sequence UNIQUE (token_id, sequence),
    CONSTRAINT fk_booking_token_claims_token
        FOREIGN KEY (token_id)
        REFERENCES booking.tokens (id)
        ON DELETE CASCADE,
    CONSTRAINT chk_booking_token_claims_sequence CHECK (sequence >= 1),
    CONSTRAINT chk_booking_token_claims_method
        CHECK (method IN ('UPI', 'CARD', 'CHEQUE', 'OTHER', 'BANK_TRANSFER')),
    CONSTRAINT chk_booking_token_claims_proof_order
        CHECK (proof_url_2 IS NULL OR proof_url_1 IS NOT NULL),
    CONSTRAINT chk_booking_token_claims_answer
        CHECK (answer IS NULL OR answer IN ('RECEIVED', 'NOT_RECEIVED')),
    -- An answer names who gave it and when. No answer names nobody.
    CONSTRAINT chk_booking_token_claims_answered
        CHECK ((answer IS NULL) = (answered_at IS NULL)
           AND (answer IS NULL) = (answered_by_user_id IS NULL)),
    -- "Not received" tells the tenant why.
    CONSTRAINT chk_booking_token_claims_refusal_reason
        CHECK (answer IS DISTINCT FROM 'NOT_RECEIVED'
            OR (answer_reason IS NOT NULL AND length(btrim(answer_reason)) > 0))
);

-- One claim waits on a token at a time.
CREATE UNIQUE INDEX uq_booking_token_claims_waiting
    ON booking.token_claims (token_id)
    WHERE answer IS NULL;

-- A cash code that was sent, and what it was sent for. The code itself lives
-- in the OTP store, keyed by phone. This ties it to one booking's token.
CREATE TABLE booking.token_cash_codes (
    id UUID NOT NULL,
    token_id UUID NOT NULL,
    amount_paise BIGINT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    -- auth.users.id. No FK: cross-module.
    requested_by_user_id UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    -- Used, or retired because a newer code went to the same number.
    consumed_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_booking_token_cash_codes PRIMARY KEY (id),
    CONSTRAINT fk_booking_token_cash_codes_token
        FOREIGN KEY (token_id)
        REFERENCES booking.tokens (id)
        ON DELETE CASCADE,
    CONSTRAINT chk_booking_token_cash_codes_amount CHECK (amount_paise > 0),
    CONSTRAINT chk_booking_token_cash_codes_lifetime CHECK (expires_at > requested_at)
);

CREATE INDEX idx_booking_token_cash_codes_token
    ON booking.token_cash_codes (token_id, requested_at DESC);

CREATE INDEX idx_booking_token_cash_codes_live_phone
    ON booking.token_cash_codes (phone)
    WHERE consumed_at IS NULL;

-- A booking already waiting for its token gets its record. Nothing could
-- receive a token before this, so every such booking owes it in full.
INSERT INTO booking.tokens (id, request_id, property_id, amount_paise, status)
SELECT gen_random_uuid(), id, property_id, token_due_paise, 'DUE'
FROM booking.requests
WHERE status = 'AWAITING_TOKEN' AND token_required AND token_due_paise > 0;
