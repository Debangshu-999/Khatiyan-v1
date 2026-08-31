package com.khatiyan.d_modules.tenancy.model;

/**
 * Which government photo ID the owner says they checked.
 *
 * <p>A list rather than Aadhaar alone, and that is a legal constraint rather
 * than a convenience. A private landlord cannot require Aadhaar for a tenancy —
 * s.57 of the Aadhaar Act was struck down in Puttaswamy — so the tenant chooses
 * what to produce and this records what they produced.
 *
 * <p>Mirrored by a CHECK constraint in V6104. Persisted and read back years
 * later as evidence, so a constant is never removed or renamed.
 */
public enum IdDocumentType {
    AADHAAR,
    PASSPORT,
    DRIVING_LICENCE,
    VOTER_ID,
    PAN,

    /**
     * Anything else the tenant produced.
     *
     * <p>Kept because the alternative is an owner picking a wrong-but-close
     * option to get past the form, which is worse than an honest "other" — a
     * declaration is only useful while it is accurate.
     */
    OTHER
}
