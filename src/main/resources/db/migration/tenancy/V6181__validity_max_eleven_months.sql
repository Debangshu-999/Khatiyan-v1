-- A fixed term runs 1 to 11 months.
--
-- The app's own checks came down from 12 to 11 on 2026-10-02: the property's
-- default term and the term set at onboarding. This brings the column's check
-- into line, so the limit holds for anything that writes the row.
--
-- Safe to tighten. When this was written no stay, live or ended, carried a term
-- over 5 months. A row of 12 would make this migration fail, not pass quietly,
-- which is the outcome wanted: it would mean a decision is owed on that stay.

ALTER TABLE tenancy.tenancies
    DROP CONSTRAINT IF EXISTS chk_tenancies_agreement_validity_months;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_agreement_validity_months
        CHECK (agreement_validity_months IS NULL OR agreement_validity_months BETWEEN 1 AND 11);
