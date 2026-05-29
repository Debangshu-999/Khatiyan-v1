package com.khatiyan.d_modules.billing.model;

/**
 * Lifecycle of a billing line item.
 *
 * <p>
 * Pending rows are tenancy-scoped future charges. Added rows are attached to a
 * generated billing cycle and count toward that cycle total.
 */
public enum BillingCycleLineItemStatus {
    PENDING,
    ADDED,
    CANCELLED
}
