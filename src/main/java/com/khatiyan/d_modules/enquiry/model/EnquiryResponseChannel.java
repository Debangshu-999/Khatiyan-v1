package com.khatiyan.d_modules.enquiry.model;

/**
 * How management said they would get back to the enquirer.
 *
 * <p>Choosing one IS the response — there is no reply message yet. The channel
 * is what the enquirer is told, so it has to be one they can actually be reached
 * on: phone is verified on every account, email only sometimes.
 */
public enum EnquiryResponseChannel {

    /** Always available. A verified phone is a precondition of having an account. */
    CALL_BACK,

    /**
     * Only offered when the enquirer has an email that is present AND verified.
     * An unverified address is an address nobody has proved they can read.
     */
    EMAIL,

    /**
     * Declared, unreachable. Chat does not exist yet; the value is here so the
     * enum does not need a migration on the day it does.
     */
    CHAT
}
