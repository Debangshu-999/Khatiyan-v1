package com.khatiyan.d_modules.expense.model;

/** Seeded system categories; owners can add custom ones on top. */
public enum ExpenseCategoryType {
    SALARY("Salary"),
    DEPOSIT_PAYOUT("Deposit payout"),
    UTILITIES("Utilities"),
    MAINTENANCE("Maintenance"),
    OTHER("Other");

    private final String displayName;

    ExpenseCategoryType(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}