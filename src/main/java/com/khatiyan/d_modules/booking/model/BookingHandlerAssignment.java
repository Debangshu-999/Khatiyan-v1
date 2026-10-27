package com.khatiyan.d_modules.booking.model;

/** How a booking request came to its handler. */
public enum BookingHandlerAssignment {
    /** They were the first to open its details. */
    FIRST_VIEW,
    /** The system gave it to them: in turn, or onward when its handler left. */
    SYSTEM
}
