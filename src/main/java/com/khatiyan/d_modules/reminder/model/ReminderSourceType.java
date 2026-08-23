package com.khatiyan.d_modules.reminder.model;

public enum ReminderSourceType {
    BILLING_CYCLE,
    TENANCY,
    CONCERN,
    SALARY_ACCOUNT,
    /** A property's payroll as a whole, for reminders batched across accounts. */
    SALARY_PAYROLL,
    EXPENSE_BUDGET
}
