-- Where a bill came from, when that changes how it behaves. Null for every
-- ordinary bill. A scheduled exit's bill stays overdue past its period, since no
-- next cycle will carry it, and it is never cancelled by hand.

ALTER TABLE billing.billing_cycles
    ADD COLUMN origin VARCHAR(30);

ALTER TABLE billing.billing_cycles
    ADD CONSTRAINT chk_billing_cycles_origin
        CHECK (origin IS NULL OR origin IN ('SCHEDULED_EXIT'));
