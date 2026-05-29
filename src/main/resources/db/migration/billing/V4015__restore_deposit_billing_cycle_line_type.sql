ALTER TABLE billing.billing_cycle_line_items
    DROP CONSTRAINT IF EXISTS chk_billing_cycle_line_items_type;

ALTER TABLE billing.billing_cycle_line_items
    ADD CONSTRAINT chk_billing_cycle_line_items_type
        CHECK (type IN ('RENT', 'DAILY_STAY', 'DEPOSIT', 'EXTRA_CHARGE', 'LATE_FEE', 'DISCOUNT'));

ALTER TABLE IF EXISTS billing.bill_line_items
    DROP CONSTRAINT IF EXISTS chk_bill_line_items_type;

ALTER TABLE IF EXISTS billing.bill_line_items
    ADD CONSTRAINT chk_bill_line_items_type
        CHECK (type IN ('RENT', 'DAILY_STAY', 'DEPOSIT', 'EXTRA_CHARGE', 'LATE_FEE', 'DISCOUNT'));
