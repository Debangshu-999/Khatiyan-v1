-- Lock-in becomes agreement validity, and the computed penalty engine goes.
--
-- lock_in_end_date was a minimum-stay marker that never terminated anything and
-- was never cleared, so a tenant whose term ended years ago still looked
-- "agreement-backed" forever. As agreement_end_date it means what it says: the
-- day a fixed-term agreement, and the tenancy with it, ends. Null = indefinite.
--
-- early_exit_penalty_type / _fixed_paise implemented a formula nobody agreed to
-- (proration over a flat 30, or a flat fee) with a boundary that charged the
-- entire penalty for serving a term out to its last day. Replaced by the owner's
-- own words in early_exit_rule, applied by a person at end-tenancy.

ALTER TABLE tenancy.tenancies
    RENAME COLUMN lock_in_end_date TO agreement_end_date;

ALTER TABLE tenancy.tenancies
    DROP COLUMN IF EXISTS early_exit_penalty_type,
    DROP COLUMN IF EXISTS early_exit_penalty_fixed_paise;
