-- Agreement validity, replacing lock-in.
--
-- A PG or hostel does not run minimum-stay contracts; it runs an agreement for a
-- term. Lock-in constrained only when a tenant could LEAVE and said nothing
-- about what happens when the term runs out, which is what left "does an
-- agreement ending end the tenancy" unanswered for so long.
--
-- Validity answers both ends with one field:
--   agreement_validity_months NULL  -> indefinite; ends when the tenant exits
--   agreement_validity_months = N   -> fixed term; the tenancy ends with it
--
-- early_exit_rule is the owner's own words for what leaving early costs, applied
-- by a person at end-tenancy. It replaces the computed penalty engine.
--
-- Additive. lock_in_end_date stays for now and is renamed in step 2, once the
-- readers of the penalty engine have gone.

ALTER TABLE tenancy.tenancies
    ADD COLUMN IF NOT EXISTS agreement_validity_months INT,
    ADD COLUMN IF NOT EXISTS early_exit_rule VARCHAR(2000);

ALTER TABLE tenancy.tenancies
    DROP CONSTRAINT IF EXISTS chk_tenancies_agreement_validity_months;

-- A term of zero months is not a term. Null means indefinite, which is the
-- correct default for most stays.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_agreement_validity_months
        CHECK (agreement_validity_months IS NULL OR agreement_validity_months BETWEEN 1 AND 60);
