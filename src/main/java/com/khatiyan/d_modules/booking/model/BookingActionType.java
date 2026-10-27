package com.khatiyan.d_modules.booking.model;

/**
 * What a row of a request's history records. Persisted, so a constant is never
 * removed or renamed: deprecate it instead.
 */
public enum BookingActionType {
    SUBMITTED,
    /** The property moved the booking to another bed because the booked one was occupied (2026-10-27). */
    BED_MOVED,
    /** The request clock ran out with no terms agreed. */
    EXPIRED,
    /** It got a handler: the first manager to open it, or the next in turn. */
    ASSIGNED,
    /** Its handler left or lost access, and it is back to whoever opens it first. */
    UNASSIGNED,
    /** A new offer that the other side may answer with one of their own. */
    COUNTERED,
    /** The property's last word: take it or leave it. */
    FINAL_OFFER,
    /** One side accepted the offer on the table. The terms are fixed from here. */
    AGREED,
    /** Confirmed: the token arrived, or the property takes none. */
    CONFIRMED,
    /** One side ended it. A tenant withdrawing and a property declining are both this. */
    CANCELLED,
    /** Ended by the system because the same person confirmed a booking elsewhere. */
    WITHDRAWN,
    /** Terms were agreed and the token did not arrive in time. */
    TOKEN_LAPSED,
    /** The tenant said they paid the token. */
    TOKEN_CLAIMED,
    /** The property said the token arrived. */
    TOKEN_RECEIVED,
    /** The property said a claimed payment did not arrive. */
    TOKEN_NOT_RECEIVED,
    /** The owner chose to hold the bed without a token after all. */
    TOKEN_WAIVED,
    /** @deprecated Refunds are not tracked since 2026-10-28. Kept for old history rows. */
    @Deprecated
    TOKEN_REFUND_SENT,
    /** @deprecated Refunds are not tracked since 2026-10-28. Kept for old history rows. */
    @Deprecated
    TOKEN_REFUND_CONFIRMED,
    /** @deprecated Refunds are not tracked since 2026-10-28. Kept for old history rows. */
    @Deprecated
    TOKEN_REFUND_DISPUTED,
    /** The handler decided a no-show's token is owed back (2026-10-28). */
    TOKEN_REFUND_OWED,
    /** The handler decided a no-show's token is kept, non refundable (2026-10-28). */
    TOKEN_KEPT,
    /** The tenant arrived and a stay was created from the booking. */
    CONVERTED,
    /** The tenant signed and the stay started. */
    MOVED_IN,
    /** The tenant moved the move-in date to a later day. Once. */
    DATE_PUSHED,
    /** The property offered another bed in place of one that is still occupied. */
    BED_OFFERED,
    /** The tenant took the other bed. */
    BED_OFFER_ACCEPTED,
    /** The tenant did not take it. */
    BED_OFFER_DECLINED
}
