package com.khatiyan.d_modules.payment.model;

/**
 * Processing state for an idempotent payment operation.
 *
 * <p>
 * PROCESSING means one request has claimed the key and is still creating the
 * side effect. COMPLETED means repeats can safely return the original result.
 * FAILED preserves a failed attempt so the same key is not reused silently for a
 * different outcome.
 */
public enum PaymentIdempotencyStatus {
    PROCESSING,
    COMPLETED,
    FAILED
}
