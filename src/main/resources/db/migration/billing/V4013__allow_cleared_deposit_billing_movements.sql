ALTER TABLE billing.deposit_movements
    DROP CONSTRAINT IF EXISTS chk_deposit_movements_amount_positive;

ALTER TABLE billing.deposit_movements
    ADD CONSTRAINT chk_deposit_movements_amount_non_negative
        CHECK (amount_paise >= 0);
