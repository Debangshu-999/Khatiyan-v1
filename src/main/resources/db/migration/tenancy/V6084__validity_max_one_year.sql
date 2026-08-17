-- Agreement validity caps at 12 months.
--
-- 60 was an arbitrary ceiling carried over from thinking of this as a lock-in.
-- A PG or hostel agreement beyond a year is not a real arrangement — and since
-- a fixed term now ENDS the tenancy, an over-long one commits both sides to a
-- date neither can revisit until renewal exists.

ALTER TABLE tenancy.tenancies
    DROP CONSTRAINT IF EXISTS chk_tenancies_agreement_validity_months;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_agreement_validity_months
        CHECK (agreement_validity_months IS NULL OR agreement_validity_months BETWEEN 1 AND 12);
