-- A fixed-term monthly tenancy needs a planned end date.
--
-- The constraint predates agreement validity, when only a daily stay knew its
-- own last day: it required planned_end_date IS NULL for every MONTHLY row.
-- Stamping a fixed term now sets that column (it is what puts the tenancy into
-- Upcoming exits without an expiry job discovering it later), so the first
-- fixed-term agreement would have failed on flush with a constraint violation.
--
-- Nothing caught it: no test loads a Spring context, so the suite never reaches
-- this constraint, and no tenancy carries an agreement yet.
--
-- MONTHLY may now have a planned end date or not — indefinite agreements leave
-- it null. DAILY still requires one, unchanged.
ALTER TABLE tenancy.tenancies
    DROP CONSTRAINT chk_tenancies_billing_type_fields;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_billing_type_fields CHECK (
        (billing_type = 'MONTHLY'
            AND rent_amount_paise IS NOT NULL AND rent_amount_paise > 0
            AND deposit_amount_paise IS NOT NULL AND deposit_amount_paise >= 0
            AND daily_rate_paise IS NULL)
        OR (billing_type = 'DAILY'
            AND rent_amount_paise IS NULL
            AND deposit_amount_paise IS NULL
            AND daily_rate_paise IS NOT NULL AND daily_rate_paise > 0
            AND planned_end_date IS NOT NULL));

-- A stamped fixed term must agree with the date derived from it. Catches a
-- future path that writes one without the other.
ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_agreement_end_matches_planned CHECK (
        agreement_end_date IS NULL
        OR billing_type <> 'MONTHLY'
        OR planned_end_date = agreement_end_date);
