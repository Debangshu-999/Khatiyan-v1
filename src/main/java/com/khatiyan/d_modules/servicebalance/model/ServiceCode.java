package com.khatiyan.d_modules.servicebalance.model;

/**
 * A paid Khatiyan service this balance can buy.
 *
 * <p>An enum rather than free text: a ledger line has to say what was bought
 * years later, and a typo in a string would leave money spent on something
 * nobody can name.
 *
 * <p>Prices live in configuration, not here. They change, and a constant would
 * make yesterday's charge look wrong the moment one did.
 */
public enum ServiceCode {

    /**
     * One Aadhaar identity check by OTP.
     *
     * <p>Superseded by {@link #AADHAAR} (2026-09-27) and no longer offered, but
     * never removed: grants and ledger rows already carry it.
     */
    AADHAAR_OKYC,
    /** One Aadhaar identity check through the Aadhaar App (offline verification). */
    AADHAAR
}
