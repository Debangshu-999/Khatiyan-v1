-- Reshape budgets: a single recurring default per property (set once, editable),
-- plus separately-tracked per-month raises. The effective monthly budget is
-- default + sum(raises for the month); savings = effective - spend when positive.
DROP TABLE IF EXISTS expense.expense_budgets;

CREATE TABLE expense.expense_budget_settings (
    property_id UUID PRIMARY KEY,
    default_monthly_budget_paise BIGINT NOT NULL,
    created_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_expense_budget_settings_amount CHECK (default_monthly_budget_paise >= 0)
);

-- Each "raise budget" action: an additive bump on top of the default for a month,
-- kept as its own row so we can report how much was raised in a given month.
CREATE TABLE expense.expense_budget_raises (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    budget_month DATE NOT NULL,
    amount_paise BIGINT NOT NULL,
    reason VARCHAR(300),
    created_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_expense_budget_raises_amount CHECK (amount_paise > 0)
);

CREATE INDEX idx_expense_budget_raises_property_month
    ON expense.expense_budget_raises (property_id, budget_month);
