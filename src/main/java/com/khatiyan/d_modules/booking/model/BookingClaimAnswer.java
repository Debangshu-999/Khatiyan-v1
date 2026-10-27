package com.khatiyan.d_modules.booking.model;

/**
 * The property's answer to a tenant's "I've paid". Persisted, so a constant is
 * never removed or renamed.
 */
public enum BookingClaimAnswer {
    RECEIVED,
    /** Carries the reason the tenant is shown. The token is still owed. */
    NOT_RECEIVED
}
