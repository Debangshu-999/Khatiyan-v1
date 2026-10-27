-- A booking token the property already holds, taken off the stay's first bill.
--
-- Plan: docs/superpowers/plans/2026-10-07-post-visit-bookings.md, chunk 6B.
-- Immutable from first write: a correction is a later Flyway version.
--
-- The token is money received before the stay began. It is not a discount, so
-- it gets its own line type and its own amount on the bill. Folding it into
-- discount_amount_paise would have had the owner's reports count money they
-- were paid as money they gave away.

ALTER TABLE billing.billing_cycles
    ADD COLUMN booking_token_credit_paise BIGINT NOT NULL DEFAULT 0;

ALTER TABLE billing.billing_cycles
    ADD CONSTRAINT chk_billing_cycles_booking_token_credit
        CHECK (booking_token_credit_paise >= 0);

ALTER TABLE billing.billing_cycle_line_items
    DROP CONSTRAINT IF EXISTS chk_billing_cycle_line_items_type;

ALTER TABLE billing.billing_cycle_line_items
    ADD CONSTRAINT chk_billing_cycle_line_items_type
        CHECK (type IN ('RENT', 'DAILY_STAY', 'DEPOSIT', 'EXTRA_CHARGE', 'LATE_FEE', 'DISCOUNT', 'BOOKING_TOKEN'));

ALTER TABLE IF EXISTS billing.bill_line_items
    DROP CONSTRAINT IF EXISTS chk_bill_line_items_type;

ALTER TABLE IF EXISTS billing.bill_line_items
    ADD CONSTRAINT chk_bill_line_items_type
        CHECK (type IN ('RENT', 'DAILY_STAY', 'DEPOSIT', 'EXTRA_CHARGE', 'LATE_FEE', 'DISCOUNT', 'BOOKING_TOKEN'));
