-- Admits UPCOMING to the status check.
--
-- V6057 introduced the state and the column it stamps, but left this constraint
-- listing only the original four, so the first cycle generated ahead of its
-- window was rejected on insert. The enum is enumerated in two places — Java and
-- here — and only one of them is checked at build time.
ALTER TABLE billing.billing_cycles
    DROP CONSTRAINT chk_billing_cycles_status;

ALTER TABLE billing.billing_cycles
    ADD CONSTRAINT chk_billing_cycles_status
        CHECK (status IN ('UPCOMING', 'UNPAID', 'OVERDUE', 'PAID', 'CANCELLED'));
