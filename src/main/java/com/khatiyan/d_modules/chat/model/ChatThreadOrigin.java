package com.khatiyan.d_modules.chat.model;

/**
 * What the conversation grew out of.
 *
 * <p>Paired with {@link ChatThreadKind} this produces the management screen's
 * three sections without a fourth concept: My chats is DIRECT + PERSONAL,
 * Tenants is TEAM + TENANCY, Enquiries is DIRECT + ENQUIRY.
 */
public enum ChatThreadOrigin {

    /** A stay. Carries the tenancy id, and closes when the stay ends. */
    TENANCY,

    /**
     * An enquiry answered over chat. Private to the prospect and whoever
     * answered them, and the only origin whose threads are meant to be closed.
     */
    ENQUIRY,

    /** Somebody started a one-to-one. Carries no origin id. */
    PERSONAL,

    /**
     * A booking made in the app (user, 2026-10-27). Carries the booking id.
     * Private to the person who booked and whoever handles the booking now,
     * and read-only once the booking ends.
     */
    BOOKING
}
