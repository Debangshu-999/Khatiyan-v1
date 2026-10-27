package com.khatiyan.d_modules.booking.model;

public enum BookingTokenAction {
    /** Tenant: "I've paid", with an optional reference or photo. */
    CLAIM_PAID,
    /** Property: the money arrived. Also the direct path for cash. */
    MARK_RECEIVED,
    /** Property: the claimed payment did not arrive. Needs a reason. */
    MARK_NOT_RECEIVED,
    /** Owner only: hold the bed without a token after all. */
    WAIVE,
    /** Property, for a guest who did not arrive: the token is owed back (user, 2026-10-28). */
    REFUND_TOKEN,
    /** Property, for a guest who did not arrive: the token is kept, non refundable. */
    KEEP_TOKEN
}
