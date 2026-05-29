ALTER TABLE tenancy.tenancies
    DROP CONSTRAINT IF EXISTS chk_tenancies_billing_type_fields;

ALTER TABLE tenancy.tenancies
    DROP COLUMN IF EXISTS rent_due_day;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancies_billing_type_fields
        CHECK (
            (
                billing_type = 'MONTHLY'
                AND rent_amount_paise IS NOT NULL
                AND rent_amount_paise > 0
                AND deposit_amount_paise IS NOT NULL
                AND deposit_amount_paise >= 0
                AND daily_rate_paise IS NULL
                AND planned_end_date IS NULL
            )
            OR
            (
                billing_type = 'DAILY'
                AND rent_amount_paise IS NULL
                AND deposit_amount_paise IS NULL
                AND daily_rate_paise IS NOT NULL
                AND daily_rate_paise > 0
                AND planned_end_date IS NOT NULL
            )
        );
