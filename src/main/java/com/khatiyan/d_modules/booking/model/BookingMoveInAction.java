package com.khatiyan.d_modules.booking.model;

/** What can be done about a confirmed booking around its move-in day. */
public enum BookingMoveInAction {
    /** Tenant: move the move-in date to a later day. Once, and only before the day itself. */
    PUSH_DATE,
    /** Property: the tenant has arrived. Onboard them into the bed they booked. */
    CONVERT,
    /** Property: nobody came. From the day after the move-in date, bed free or not (user, 2026-10-27). */
    CLOSE_DID_NOT_ARRIVE,
    /** Property: the booked bed is still not ready after its extra days. Offer the tenant another. */
    OFFER_ANOTHER_BED,
    /**
     * Property: the booked bed is still occupied on or after the move-in day, so the handler moves
     * the booking to a free bed straight away, at the onboarding desk (user, 2026-10-27).
     */
    MOVE_TO_ANOTHER_BED,
    /** Tenant: take the other bed the property has offered. */
    ACCEPT_ANOTHER_BED,
    /** Tenant: do not take it. */
    DECLINE_ANOTHER_BED,
    /** Tenant: the bed is still not ready after the property's extra days. Leave, with the token owed back. */
    LEAVE_BED_NOT_READY
}
