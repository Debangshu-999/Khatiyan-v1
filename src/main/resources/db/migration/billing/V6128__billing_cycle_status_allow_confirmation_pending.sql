-- Admits CONFIRMATION_PENDING to the status check.
--
-- V6124/V6125 introduced the state, the column that remembers what to revert it
-- to, and every Java path that sets it — but left this constraint listing the
-- five that came before, so the first tenant to press "Yes, I paid" was rejected
-- at flush time with a DataIntegrityViolationException, not a validation error.
-- The bill stayed unpaid and the attempt stayed open.
--
-- This is the SECOND time this exact constraint has been the thing that was
-- forgotten: V6062 says the same about UPCOMING, in nearly the same words. The
-- status enum is enumerated in two places, Java and here, and only one of them
-- is checked at build time — so adding a constant to BillingCycleStatus means
-- writing a migration in the same change, every time.
--
-- Its own migration rather than an edit to V6125: that one is already applied,
-- and changing an applied file is a checksum mismatch that refuses to boot.
ALTER TABLE billing.billing_cycles
    DROP CONSTRAINT chk_billing_cycles_status;

ALTER TABLE billing.billing_cycles
    ADD CONSTRAINT chk_billing_cycles_status
        CHECK (status IN ('UPCOMING', 'UNPAID', 'OVERDUE', 'CONFIRMATION_PENDING', 'PAID', 'CANCELLED'));

-- The parked state a rejection restores. Only ever one of the two states a bill
-- can be claimed from, and null the rest of the time — constrained rather than
-- left as free text, so a bad revert target is refused here rather than
-- discovered when the revert puts a bill into a state that does not exist.
ALTER TABLE billing.billing_cycles
    ADD CONSTRAINT chk_billing_cycles_status_before_confirmation
        CHECK (status_before_confirmation IS NULL
               OR status_before_confirmation IN ('UNPAID', 'OVERDUE'));
