ALTER TABLE billing.bills
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PAID';

ALTER TABLE billing.bills
    ALTER COLUMN paid_at DROP NOT NULL;

ALTER TABLE billing.bills
    DROP CONSTRAINT IF EXISTS chk_bills_status;

ALTER TABLE billing.bills
    ADD CONSTRAINT chk_bills_status
        CHECK (status IN ('UNPAID', 'PAID'));
