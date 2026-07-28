package com.khatiyan.d_modules.billing.model;

/**
 * Lifecycle state of a billing cycle.
 *
 * <p>
 * V1 intentionally does not support partial payments. A cycle is either
 * upcoming, unpaid, overdue, fully paid, or cancelled before payment.
 *
 * <p>
 * {@code UPCOMING} is the only mutable state. A cycle is generated ahead of its
 * period start in this state, where owners may add charges and the property's
 * late-fee rate still applies to it. When its window opens the cycle activates
 * to {@code UNPAID}, freezing both its charges and its late-fee rate — from
 * that moment nothing can change its total, so a tenant always pays exactly the
 * amount they were shown. Charges arising afterwards belong to the next cycle.
 */
public enum BillingCycleStatus {
    UPCOMING,
    UNPAID,
    OVERDUE,
    PAID,
    CANCELLED
}