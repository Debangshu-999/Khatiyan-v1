-- A token paid at the property's desk, recorded by the tenant (2026-10-11).
--
-- The tenant's pay sheet gains "Paid at desk", with how it was paid there:
-- cash, card, UPI or cheque. It is recorded like any other payment and the
-- property answers it the same way, "received" or "not received".
--
-- Until now a claim could never be cash: the property recorded cash itself,
-- which left a property that takes tokens only at its desk no way to confirm
-- one from the app. Cash is now a claim's method, and only at the desk.
ALTER TABLE booking.token_claims
    ADD COLUMN paid_at_desk BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE booking.token_claims
    DROP CONSTRAINT chk_booking_token_claims_method;

ALTER TABLE booking.token_claims
    ADD CONSTRAINT chk_booking_token_claims_method
        CHECK (method IN ('CASH', 'UPI', 'CARD', 'CHEQUE', 'OTHER', 'BANK_TRANSFER')),
    -- Cash changes hands at the desk and nowhere else.
    ADD CONSTRAINT chk_booking_token_claims_cash_at_desk
        CHECK (method <> 'CASH' OR paid_at_desk);
