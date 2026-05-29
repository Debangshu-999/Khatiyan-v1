package com.khatiyan.d_modules.payment.model;

/**
 * Lifecycle of an internal payment order.
 *
 * <p>A payment order is our intent to collect money for a billing cycle.
 * It may have one or more provider-side attempts before it becomes paid
 * or finally fails/expires.
 */
public enum PaymentOrderStatus {
    CREATED,
    ATTEMPTED,
    PAID,
    FAILED,
    CANCELLED,
    EXPIRED
}
