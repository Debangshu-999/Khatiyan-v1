package com.khatiyan.d_modules.booking.model;

/**
 * A request holds one bed from the moment it is sent, so a bed is asked for by
 * one person at a time. Receiving a token keeps it while the property explicitly
 * confirms the booking. However a booking ends short of that, the bed is freed.
 * None of these is tenancy activation.
 */
public enum BookingStatus {
    AWAITING_HANDLER,
    AWAITING_TENANT,
    /** Terms agreed, for as long as the token window runs. */
    AWAITING_TOKEN,
    /** Token received; the property must still explicitly confirm the booking. */
    TOKEN_RECEIVED,
    CONFIRMED,
    CANCELLED,
    EXPIRED,
    /** The stay created from it has started. The booking is over, and it ended well. */
    MOVED_IN;

    /** Still negotiating: the request clock applies. */
    public boolean isPending() {
        return this == AWAITING_HANDLER || this == AWAITING_TENANT;
    }

    /** Terms are agreed: the rent, room and dates are no longer on the table. */
    public boolean isAgreed() {
        return this == AWAITING_TOKEN || this == TOKEN_RECEIVED || this == CONFIRMED;
    }

    /** Every booking that is still going holds exactly one bed. One that is over holds none. */
    public boolean holdsBed() {
        return isPending() || isAgreed();
    }
}
