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

    /** One Aadhaar identity check on a tenant, through the provider. */
    AADHAAR_OKYC
}
