-- Lock-in / early-exit terms stamped from the accepted agreement onto the
-- tenancy (agreement-backed tenancies only). lock_in_end_date is a minimum-stay
-- marker; it never auto-terminates the tenancy.
ALTER TABLE tenancy.tenancies
    ADD COLUMN lock_in_end_date DATE,
    ADD COLUMN early_exit_penalty_type VARCHAR(20),
    ADD COLUMN early_exit_penalty_fixed_paise BIGINT;
