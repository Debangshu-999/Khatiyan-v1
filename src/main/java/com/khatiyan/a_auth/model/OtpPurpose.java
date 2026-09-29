package com.khatiyan.a_auth.model;

/**
 * Reason an OTP was issued.
 *
 * <p>The purpose is stored with each OTP so a code requested for one
 * flow, such as PIN reset, cannot be reused for another flow, such as
 * daily login.
 */
public enum OtpPurpose {
    LOGIN,
    PIN_RESET,
    EMAIL_LOGIN,

    /**
     * Signing a tenancy agreement.
     *
     * <p>Its own purpose so a code the tenant requested to log in cannot be
     * turned into a signature. That separation is the whole reason this enum
     * exists, and it matters more here than anywhere else: every other purpose
     * grants access, which the person can undo by signing out. This one binds
     * them to a contract.
     */
    AGREEMENT_ACCEPTANCE,

    /**
     * A tenant confirming, face to face, that they handed over cash for a bill.
     *
     * <p>Cash leaves no trail of its own — no UPI reference, no bank line — so
     * "the owner says it was paid" was the whole record. The tenant reading
     * this code aloud is what turns that into something both sides agreed to.
     *
     * <p>Its own purpose for the same reason as the agreement: a code sent to
     * log in must not be spendable as an admission that money changed hands.
     */
    CASH_PAYMENT
}
