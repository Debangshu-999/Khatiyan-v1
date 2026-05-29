package com.khatiyan.d_modules.payment.model;

/**
 * Processing state of a received provider webhook.
 *
 * <p>Provider webhooks may be retried, duplicated, or arrive out of order.
 * Keeping a stateful webhook record lets us verify signatures, process once,
 * and keep an audit trail.
 */
public enum PaymentWebhookProcessingStatus {
    RECEIVED,
    PROCESSED,
    IGNORED,
    FAILED
}
