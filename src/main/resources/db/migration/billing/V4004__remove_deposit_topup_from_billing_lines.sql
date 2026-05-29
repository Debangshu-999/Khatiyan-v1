ALTER TABLE billing.billing_cycle_line_items
    DROP CONSTRAINT IF EXISTS chk_billing_cycle_line_items_type;

ALTER TABLE billing.billing_cycle_line_items
    ADD CONSTRAINT chk_billing_cycle_line_items_type
        CHECK (type IN (
            'RENT',
            'DEPOSIT',
            'DAILY_STAY',
            'EXTRA_CHARGE',
            'LATE_FEE',
            'DISCOUNT'
        ));

ALTER TABLE billing.bill_line_items
    DROP CONSTRAINT IF EXISTS chk_bill_line_items_type;

ALTER TABLE billing.bill_line_items
    ADD CONSTRAINT chk_bill_line_items_type
        CHECK (type IN (
            'RENT',
            'DEPOSIT',
            'DAILY_STAY',
            'EXTRA_CHARGE',
            'LATE_FEE',
            'DISCOUNT'
        ));

ALTER TABLE billing.billing_cycle_line_items
    DROP CONSTRAINT IF EXISTS chk_billing_cycle_line_items_settlement_action;

ALTER TABLE billing.billing_cycle_line_items
    ADD CONSTRAINT chk_billing_cycle_line_items_settlement_action
        CHECK (settlement_action IN (
            'SYSTEM_CHARGE',
            'ADDED_TO_BILL',
            'ADJUSTED_FROM_DEPOSIT',
            'WAIVED',
            'DISCOUNTED'
        ));

ALTER TABLE billing.bill_line_items
    DROP CONSTRAINT IF EXISTS chk_bill_line_items_settlement_action;

ALTER TABLE billing.bill_line_items
    ADD CONSTRAINT chk_bill_line_items_settlement_action
        CHECK (settlement_action IN (
            'SYSTEM_CHARGE',
            'ADDED_TO_BILL',
            'ADJUSTED_FROM_DEPOSIT',
            'WAIVED',
            'DISCOUNTED'
        ));
