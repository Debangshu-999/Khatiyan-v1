CREATE TABLE IF NOT EXISTS billing.billing_monthly_reports (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    report_month DATE NOT NULL,
    csv_content TEXT NOT NULL,
    cycle_count BIGINT NOT NULL,
    total_collectable_paise BIGINT NOT NULL,
    total_collected_paise BIGINT NOT NULL,
    total_pending_paise BIGINT NOT NULL,
    total_discount_paise BIGINT NOT NULL,
    manual_collected_paise BIGINT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_billing_monthly_reports_property_month
        UNIQUE (property_id, report_month)
);

CREATE INDEX IF NOT EXISTS idx_billing_monthly_reports_property_month
    ON billing.billing_monthly_reports (property_id, report_month DESC);
