package com.khatiyan.d_modules.booking.api.dto;

/** Which half of a property's bookings a list shows. */
public enum BookingListFilter {
    /** Still going: being negotiated, awaiting the token, or confirmed. */
    OPEN,
    /** Over: cancelled, expired, or out of time. */
    HISTORY
}
