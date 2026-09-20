package com.khatiyan.d_modules.verification.model;

/**
 * Where one run at a check has got to.
 *
 * <p>Persisted by name, so nothing here may be renamed or removed once an
 * attempt has carried it.
 */
public enum VerificationAttemptStatus {

    /**
     * The provider sent an OTP and we are waiting for the tenant to type it.
     *
     * <p>The only state in which an attempt is still open. Everything else is
     * final.
     */
    AWAITING_OTP,

    /** The provider returned the tenant's details. */
    SUCCEEDED,

    /**
     * The provider answered, and the answer was no.
     *
     * <p>A wrong OTP, an Aadhaar number with no linked mobile, a mismatch the
     * provider itself rejected. <b>Still charged</b>: they did the work and
     * billed us for it, and pretending otherwise would just move the cost to
     * us.
     */
    FAILED,

    /**
     * The OTP window closed with nothing submitted.
     *
     * <p>Whether this cost anything depends on which call the provider bills.
     * The attempt keeps its price either way, so the ledger can be reconciled
     * against their invoice rather than argued about.
     */
    EXPIRED
}
