-- Backstop for the late-fee recalculation scheduler (recalculateLateFees).
--
-- That job keeps exactly one system-generated LATE_FEE line per billing cycle
-- by reading existing late-fee lines and updating in place. Under ShedLock only
-- one instance runs it at a time, so a concurrent double-insert cannot happen in
-- normal operation. This partial unique index is defense-in-depth: if the lock
-- ever expired mid-run (split brain), it guarantees the database still refuses a
-- second system late-fee row for the same cycle.
--
-- Scoped to system-generated rows only, so it never blocks a manually added
-- LATE_FEE line item (system_generated = false).
CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_line_items_system_late_fee_per_cycle
    ON billing.billing_cycle_line_items (billing_cycle_id)
    WHERE type = 'LATE_FEE' AND system_generated = true;
