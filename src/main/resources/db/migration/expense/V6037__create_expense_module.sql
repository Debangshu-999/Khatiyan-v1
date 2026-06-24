CREATE SCHEMA IF NOT EXISTS expense;

-- Property-scoped expense categories (system seed + owner custom).
CREATE TABLE expense.expense_categories (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    normalized_name VARCHAR(120) NOT NULL,
    system_key VARCHAR(40),
    is_system BOOLEAN NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uk_expense_categories_property_normalized UNIQUE (property_id, normalized_name)
);

CREATE INDEX idx_expense_categories_property_active
    ON expense.expense_categories (property_id, is_active);

-- Append-only expense ledger. Reversal rows hold a negative amount and point at
-- the original, so a month's net spend is SUM(amount_paise).
CREATE TABLE expense.expenses (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    category_id UUID NOT NULL,
    paid_to VARCHAR(160),
    amount_paise BIGINT NOT NULL,
    incurred_date DATE NOT NULL,
    entry_type VARCHAR(16) NOT NULL,
    source_ref_type VARCHAR(24),
    source_ref_id UUID,
    reverses_expense_id UUID,
    description VARCHAR(500),
    created_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_expenses_category
        FOREIGN KEY (category_id) REFERENCES expense.expense_categories (id),
    CONSTRAINT chk_expenses_entry_type
        CHECK (entry_type IN ('MANUAL', 'RECURRING', 'AUTO', 'REVERSAL')),
    CONSTRAINT chk_expenses_source_ref_type
        CHECK (source_ref_type IS NULL OR source_ref_type IN ('SALARY_PAYMENT', 'DEPOSIT_MOVEMENT', 'RECURRING_EXPENSE'))
);

CREATE INDEX idx_expenses_property_incurred
    ON expense.expenses (property_id, incurred_date);

-- Idempotent auto-feed: at most one expense per source salary payment / deposit
-- payout, so an event replay can never double-post.
CREATE UNIQUE INDEX ux_expenses_auto_source
    ON expense.expenses (source_ref_type, source_ref_id)
    WHERE source_ref_type IN ('SALARY_PAYMENT', 'DEPOSIT_MOVEMENT') AND source_ref_id IS NOT NULL;

-- One spend ceiling per property per month (stored first-of-month).
CREATE TABLE expense.expense_budgets (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    budget_month DATE NOT NULL,
    amount_paise BIGINT NOT NULL,
    created_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT uk_expense_budgets_property_month UNIQUE (property_id, budget_month),
    CONSTRAINT chk_expense_budgets_amount CHECK (amount_paise >= 0)
);

-- Monthly recurring expense templates, materialised by the scheduler.
CREATE TABLE expense.recurring_expenses (
    id UUID PRIMARY KEY,
    property_id UUID NOT NULL,
    category_id UUID NOT NULL,
    paid_to VARCHAR(160) NOT NULL,
    amount_paise BIGINT NOT NULL,
    description VARCHAR(500),
    day_of_month INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_generated_month DATE,
    created_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT fk_recurring_expenses_category
        FOREIGN KEY (category_id) REFERENCES expense.expense_categories (id),
    CONSTRAINT chk_recurring_expenses_amount CHECK (amount_paise > 0),
    CONSTRAINT chk_recurring_expenses_day CHECK (day_of_month BETWEEN 1 AND 28)
);

CREATE INDEX idx_recurring_expenses_property_active
    ON expense.recurring_expenses (property_id, is_active);
