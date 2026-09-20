-- The monthly budget, remembered as it changes.
--
-- There was one default per property and every month read it, so editing the
-- budget rewrote every past month's budget too — a month that ran on 50,000
-- showed 80,000 the day the owner raised the default. Each change is now a row
-- effective from a month; a month's default is the latest row effective on or
-- before it, so earlier months keep the budget they actually had.
CREATE TABLE expense.expense_budget_versions (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    effective_month DATE NOT NULL,
    amount_paise BIGINT NOT NULL,
    created_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_expense_budget_versions_amount CHECK (amount_paise >= 0),
    CONSTRAINT uq_expense_budget_versions_property_month UNIQUE (property_id, effective_month)
);

CREATE INDEX idx_expense_budget_versions_property_month
    ON expense.expense_budget_versions (property_id, effective_month DESC);

-- Every budget set before this change applied to all months, and what it was
-- before its last edit was never kept. So each existing default becomes one
-- version effective from the start of time: every month shows exactly what it
-- showed yesterday, and only edits from now on are dated.
INSERT INTO expense.expense_budget_versions
    (id, property_id, effective_month, amount_paise, created_by_user_id, created_at, updated_at)
SELECT gen_random_uuid(), property_id, DATE '2000-01-01', default_monthly_budget_paise, created_by_user_id, NOW(), NOW()
FROM expense.expense_budget_settings;
