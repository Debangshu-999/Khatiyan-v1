ALTER TABLE tenancy.tenancies
    ADD COLUMN IF NOT EXISTS billing_type VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
    ADD COLUMN IF NOT EXISTS daily_rate_paise BIGINT,
    ADD COLUMN IF NOT EXISTS planned_end_date DATE;

ALTER TABLE tenancy.tenancies
    ALTER COLUMN rent_amount_paise DROP NOT NULL,
    ALTER COLUMN deposit_amount_paise DROP NOT NULL,
    ALTER COLUMN rent_due_day DROP NOT NULL;

ALTER TABLE tenancy.tenancies
    ADD CONSTRAINT chk_tenancy_billing_type
        CHECK (billing_type IN ('MONTHLY', 'DAILY')),
    ADD CONSTRAINT chk_monthly_tenancy_terms
        CHECK (
            billing_type <> 'MONTHLY'
            OR (
                rent_amount_paise IS NOT NULL
                AND rent_amount_paise > 0
                AND deposit_amount_paise IS NOT NULL
                AND deposit_amount_paise >= 0
                AND rent_due_day IS NOT NULL
                AND rent_due_day BETWEEN 1 AND 31
                AND daily_rate_paise IS NULL
                AND planned_end_date IS NULL
            )
        ),
    ADD CONSTRAINT chk_daily_tenancy_terms
        CHECK (
            billing_type <> 'DAILY'
            OR (
                rent_amount_paise IS NULL
                AND deposit_amount_paise IS NULL
                AND rent_due_day IS NULL
                AND daily_rate_paise IS NOT NULL
                AND daily_rate_paise > 0
                AND planned_end_date IS NOT NULL
                AND planned_end_date > start_date
                AND planned_end_date < start_date + INTERVAL '30 days'
            )
        );

CREATE INDEX IF NOT EXISTS idx_tenancies_billing_type_active
    ON tenancy.tenancies (billing_type, is_active);
