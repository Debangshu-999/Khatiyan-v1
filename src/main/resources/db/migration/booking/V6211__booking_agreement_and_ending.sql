-- Agreeing a booking's terms, and how a booking ends.
--
-- Plan: docs/superpowers/plans/2026-10-07-post-visit-bookings.md, chunk 6.
-- Immutable from first write: a correction is a later Flyway version.
--
-- The bed has been held since the request was sent, so nothing here touches
-- inventory. What the token itself records (who paid, who confirmed, refunds)
-- arrives with the token's own tables. Only the two facts the booking's own
-- state turns on live on this row: when the token falls due, and whether a
-- claim is waiting on the property, which stops that clock.

ALTER TABLE booking.requests
    ADD COLUMN agreed_at TIMESTAMPTZ,
    ADD COLUMN agreed_rent_paise BIGINT,
    -- What is owed as a token at the agreed rent. Zero where none is taken.
    ADD COLUMN token_due_paise BIGINT,
    -- When the bed stops being held for the token. Null unless one was agreed.
    ADD COLUMN token_due_at TIMESTAMPTZ,
    -- The tenant says they paid and the property has not answered yet.
    ADD COLUMN token_claim_waiting BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN confirmed_at TIMESTAMPTZ,
    -- Why a cancelled booking ended. An expired one has no cause: its clock ran out.
    ADD COLUMN end_cause VARCHAR(30),
    -- Which side cancelled it. Null when the system did, such as a withdrawal
    -- because the person confirmed a booking elsewhere.
    ADD COLUMN cancelled_by VARCHAR(12),
    -- auth.users.id. No FK: cross-module.
    ADD COLUMN cancelled_by_user_id UUID,
    ADD COLUMN cancel_reason VARCHAR(500);

-- No code could agree, confirm or cancel a booking before this version, so
-- there should be nothing to fill in. These only keep the constraints below
-- from failing on a database where a row was put into one of those states by
-- hand. Such a row is given the terms on the table as its agreed terms.
UPDATE booking.requests
SET agreed_at = updated_at,
    agreed_rent_paise = current_rent_paise,
    token_due_paise = CASE WHEN token_required THEN LEAST(token_amount_paise, current_rent_paise) ELSE 0 END,
    confirmed_at = CASE WHEN status = 'CONFIRMED' THEN updated_at END,
    token_due_at = CASE WHEN status = 'AWAITING_TOKEN' THEN updated_at + INTERVAL '48 hours' END
WHERE status IN ('AWAITING_TOKEN', 'CONFIRMED');

UPDATE booking.requests
SET end_cause = 'MANAGEMENT_CANCELLED'
WHERE status = 'CANCELLED';

ALTER TABLE booking.requests
    -- Agreed means it has a time, a rent and a token amount. Not agreed means none.
    ADD CONSTRAINT chk_booking_requests_agreed_complete
        CHECK ((agreed_at IS NULL AND agreed_rent_paise IS NULL AND token_due_paise IS NULL)
            OR (agreed_at IS NOT NULL AND agreed_rent_paise IS NOT NULL AND token_due_paise IS NOT NULL
                AND agreed_rent_paise > 0 AND token_due_paise >= 0)),
    -- A request still being negotiated has no agreed terms.
    ADD CONSTRAINT chk_booking_requests_negotiating_not_agreed
        CHECK (status NOT IN ('AWAITING_HANDLER', 'AWAITING_TENANT') OR agreed_at IS NULL),
    -- Awaiting a token means terms are agreed, a token is taken, and it has a deadline.
    ADD CONSTRAINT chk_booking_requests_awaiting_token
        CHECK (status <> 'AWAITING_TOKEN'
            OR (agreed_at IS NOT NULL AND token_due_at IS NOT NULL AND token_required)),
    ADD CONSTRAINT chk_booking_requests_confirmed
        CHECK (status <> 'CONFIRMED' OR (agreed_at IS NOT NULL AND confirmed_at IS NOT NULL)),
    ADD CONSTRAINT chk_booking_requests_claim_waiting
        CHECK (NOT token_claim_waiting OR token_due_at IS NOT NULL),
    ADD CONSTRAINT chk_booking_requests_cancelled_by
        CHECK (cancelled_by IS NULL OR cancelled_by IN ('TENANT', 'MANAGEMENT')),
    -- A person's cancellation names the person. The system's names nobody.
    ADD CONSTRAINT chk_booking_requests_cancelled_by_actor
        CHECK ((cancelled_by IS NULL) = (cancelled_by_user_id IS NULL)),
    -- A cancelled booking says why.
    ADD CONSTRAINT chk_booking_requests_cancelled_has_cause
        CHECK (status <> 'CANCELLED' OR end_cause IS NOT NULL);
