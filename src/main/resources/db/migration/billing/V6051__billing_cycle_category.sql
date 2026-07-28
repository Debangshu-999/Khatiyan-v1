-- Distinguish rent cycles from one-off bills (e.g. early-exit penalties). One-off
-- bills carry no cycle number and are ignored by the monthly rent scheduler.
ALTER TABLE billing.billing_cycles
    ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'RENT_CYCLE';

-- One-off bills have no cycle number. The unique (tenancy_id, cycle_number)
-- constraint still holds — Postgres treats each NULL as distinct.
ALTER TABLE billing.billing_cycles
    ALTER COLUMN cycle_number DROP NOT NULL;

ALTER TABLE billing.billing_cycles
    DROP CONSTRAINT chk_billing_cycles_cycle_number_positive;

ALTER TABLE billing.billing_cycles
    ADD CONSTRAINT chk_billing_cycles_cycle_number_positive
        CHECK (cycle_number IS NULL OR cycle_number > 0);
