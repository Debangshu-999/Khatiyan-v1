package com.khatiyan.d_modules.billing.model;

/**
 * Lifecycle state of a billing cycle.
 *
 * <p>
 * V1 intentionally does not support partial payments. A cycle is either unpaid,
 * overdue, fully paid, or cancelled before payment.
 */
public enum BillingCycleStatus {
    UNPAID,
    OVERDUE,
    PAID,
    CANCELLED
}