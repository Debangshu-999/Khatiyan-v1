package com.khatiyan.a_auth.model;

/**
 * Reason captured for an unsuccessful PIN login attempt.
 *
 * <p>The login attempt ledger uses these values for durable rate limiting,
 * security review, and debugging suspicious login patterns.
 */
public enum LoginFailureReason {
    USER_NOT_FOUND,
    ACCOUNT_LOCKED,
    INVALID_PIN,
    TEMPORARY_RATE_LIMITED,
    DURABLE_RATE_LIMITED
}
