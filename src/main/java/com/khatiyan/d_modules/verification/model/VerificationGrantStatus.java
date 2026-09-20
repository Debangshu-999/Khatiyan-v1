package com.khatiyan.d_modules.verification.model;

/**
 * Where one ordered check has got to.
 *
 * <p>Persisted by name, so nothing here may be renamed or removed once a
 * tenancy has carried it.
 */
public enum VerificationGrantStatus {

    /** Ordered and waiting on the tenant. */
    PENDING,

    /** The tenant passed it. Nothing further is charged for this check. */
    VERIFIED,

    /**
     * Every granted attempt has been used and none passed.
     *
     * <p>Not a verdict on the tenant — a mistyped Aadhaar number three times
     * over lands here too. The owner can grant more attempts, which costs them
     * again, or fall back to checking an ID themselves.
     */
    EXHAUSTED,

    /**
     * The tenancy went away before the tenant got to it.
     *
     * <p>Costs nothing: unused attempts were never charged, because a check the
     * provider never ran is a check we were never billed for.
     */
    CANCELLED
}
