DELETE FROM billing.bill_line_items
WHERE type = 'DEPOSIT';

DELETE FROM billing.billing_cycle_line_items
WHERE type = 'DEPOSIT';

ALTER TABLE billing.billing_cycle_line_items
DROP CONSTRAINT IF EXISTS chk_billing_cycle_line_items_type;

ALTER TABLE billing.billing_cycle_line_items
ADD CONSTRAINT chk_billing_cycle_line_items_type
CHECK (type IN ('RENT', 'DAILY_STAY', 'EXTRA_CHARGE', 'LATE_FEE', 'DISCOUNT'));

ALTER TABLE billing.bill_line_items
DROP CONSTRAINT IF EXISTS chk_bill_line_items_type;

ALTER TABLE billing.bill_line_items
ADD CONSTRAINT chk_bill_line_items_type
CHECK (type IN ('RENT', 'DAILY_STAY', 'EXTRA_CHARGE', 'LATE_FEE', 'DISCOUNT'));
