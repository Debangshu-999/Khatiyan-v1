package com.khatiyan.d_modules.expense.model;

/**
 * How much of a month's income goes into its budget (user, 2026-10-18).
 * Stored by name, so values are added and never renamed or removed.
 */
public enum BudgetIncomeMode {
    /** None: the budget is the fixed amount alone. */
    NONE,
    /** All income received that month. */
    FULL,
    /** A fixed rupee amount, never more than the income received that month. */
    PART
}
