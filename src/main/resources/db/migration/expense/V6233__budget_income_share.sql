-- This month's income as part of the monthly budget (user, 2026-10-18).
--
-- A month's budget is the fixed amount, plus a share of the income received
-- that month, plus any one-off raises. The share is NONE, FULL (all income
-- received that month) or PART (a fixed rupee amount, never more than the
-- income received that month). It lives on the version, so it carries forward
-- from the month it is set, like the fixed amount, and earlier months keep
-- the budget they had.
--
-- Immutable from first write: a correction is a later Flyway version.

ALTER TABLE expense.expense_budget_versions
    ADD COLUMN income_mode VARCHAR(10) NOT NULL DEFAULT 'NONE',
    ADD COLUMN income_part_paise BIGINT,
    ADD CONSTRAINT chk_expense_budget_versions_income_mode CHECK (income_mode IN ('NONE', 'FULL', 'PART')),
    -- A part has its amount, and only a part has one.
    ADD CONSTRAINT chk_expense_budget_versions_income_part CHECK (
        (income_mode = 'PART' AND income_part_paise IS NOT NULL AND income_part_paise > 0)
        OR (income_mode <> 'PART' AND income_part_paise IS NULL));
