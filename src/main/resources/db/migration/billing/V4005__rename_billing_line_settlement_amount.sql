ALTER TABLE billing.billing_cycle_line_items
    RENAME COLUMN original_amount_paise TO settlement_amount_paise;

ALTER TABLE billing.billing_cycle_line_items
    DROP CONSTRAINT IF EXISTS chk_billing_cycle_line_items_amounts_non_negative;

ALTER TABLE billing.billing_cycle_line_items
    ADD CONSTRAINT chk_billing_cycle_line_items_amounts_non_negative
        CHECK (amount_paise >= 0 AND settlement_amount_paise >= 0);

ALTER TABLE billing.bill_line_items
    RENAME COLUMN original_amount_paise TO settlement_amount_paise;

ALTER TABLE billing.bill_line_items
    DROP CONSTRAINT IF EXISTS chk_bill_line_items_amounts_non_negative;

ALTER TABLE billing.bill_line_items
    ADD CONSTRAINT chk_bill_line_items_amounts_non_negative
        CHECK (amount_paise >= 0 AND settlement_amount_paise >= 0);
