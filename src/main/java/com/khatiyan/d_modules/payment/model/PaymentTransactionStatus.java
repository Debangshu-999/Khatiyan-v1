package com.khatiyan.d_modules.payment.model;

/**
 * Lifecycle of a provider payment attempt.
 *
 * <p>The order is the bill-facing object. The transaction represents what
 * the provider reported for one concrete payment attempt.
 */
public enum PaymentTransactionStatus {
    INITIATED,
    SUCCESS,
    FAILED
}
