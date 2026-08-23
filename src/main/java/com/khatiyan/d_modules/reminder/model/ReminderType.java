package com.khatiyan.d_modules.reminder.model;

public enum ReminderType {
    BILL_DUE_SOON,
    BILL_DUE_TODAY,
    BILL_OVERDUE,
    TENANCY_ENDING_SOON,
    CONCERN_UNATTENDED,
    SALARY_PAYMENT_DUE,
    /** A property's salary months opened for the payroll month, batched. */
    SALARY_MONTHS_OPENED,
    /** One employee's FIRST salary month — a new joiner, announced by name. */
    SALARY_ACCOUNT_OPENED,
    BUDGET_APPROACHING,
    BUDGET_EXCEEDED
}
