package com.khatiyan.d_modules.booking.model;

/**
 * How a property chooses who handles a booking request (user, 2026-10-09).
 *
 * <p>Two modes on purpose. The owner picking a handler for each request by
 * hand, which enquiries offer, is not one of them.
 */
public enum BookingAssignmentMode {
    /** The first manager to open a request's details handles it. The default. */
    FIRST_VIEW,
    /** Each new request goes to the next manager in turn. */
    SYSTEM_TURNS
}
