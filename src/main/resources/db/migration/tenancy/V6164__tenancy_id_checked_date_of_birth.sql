-- The date of birth the owner confirmed at the ID check (owner's rule,
-- 2026-09-27). It is what the 18+ check on a manual verification is made
-- against, so the record shows what the owner saw, not only that they looked.
--
-- Nullable and outside chk_tenancies_id_check_complete for the same reason as
-- V6163: older declarations have none, and Postgres checks even a NOT VALID
-- constraint on every UPDATE. The entity requires it on new monthly
-- declarations. A daily guest records a stated age instead, never a birthday.
ALTER TABLE tenancy.tenancies
    ADD COLUMN id_checked_date_of_birth DATE;
