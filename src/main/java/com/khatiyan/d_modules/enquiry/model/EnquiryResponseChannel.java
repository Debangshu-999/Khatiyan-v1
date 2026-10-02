package com.khatiyan.d_modules.enquiry.model;

/**
 * How management reaches an enquirer.
 *
 * <p>Choosing one starts an attempt, it does not answer the enquiry. See
 * {@link EnquiryResponse}.
 */
public enum EnquiryResponseChannel {

    /**
     * A phone call. Offered when the enquirer agreed to share their number. A
     * verified phone is a precondition of having an account.
     */
    CALL_BACK,

    /**
     * Removed as a channel on 2026-10-02. A sent email cannot be tracked, so
     * nobody could say whether it reached anyone. It is never offered, never
     * accepted, and no longer something an enquirer can agree to.
     *
     * <p>The constant stays because stored rows carry it: old responses, old
     * consents and old enquiries' shared-channel snapshots.
     */
    EMAIL,

    /**
     * The in-app conversation. Always open and needs no consent: it hands the
     * responder nothing they could keep.
     */
    CHAT
}
