package com.khatiyan.d_modules.lead.model;

/**
 * Why a record closed.
 *
 * <p>The whole list from the design is declared now, though only the first is
 * reached today. They are stored values, and a stored value is never renamed or
 * removed once written.
 */
public enum LeadCloseReason {

    /**
     * No attempt to reach them succeeded in the enquiry's 30 days. The
     * person's doing only where somebody did try: nobody trying is the
     * property's.
     */
    NO_REPLY,

    /** No visit booked within 30 days of the successful response. */
    NO_VISIT_BOOKED,

    /** The visit review said they are not interested. */
    NOT_INTERESTED,

    /** They missed the visit and did not answer "Still interested?" in 3 days, or said no. */
    NO_ANSWER_AFTER_MISSED_VISIT,

    /** Still not sure 30 days after the visit. */
    NOT_SURE_EXPIRED,

    /** The visit was not reviewed within 30 days. */
    REVIEW_OVERDUE,

    /**
     * The days to book after an attended visit ran out with no confirmed
     * booking and no request still live. Thirty days since 2026-10-07, not the
     * fifteen this was first written for.
     */
    BOOKING_WINDOW_EXPIRED,

    /** The prospect stepped out. */
    NO_LONGER_LOOKING,

    /**
     * Was set by the owner. No longer written: duplicates and potential spam
     * are marked by a rule on records that stay open (user, 2026-10-17). Kept
     * because a stored value is never removed.
     */
    SPAM,

    /** As {@link #SPAM}: no longer written. */
    DUPLICATE,

    /** They moved in. */
    CONVERTED,

    /**
     * Their visit was cancelled and their enquiry's window closed with no
     * other booked (owner's rule, 2026-10-03). Appended: stored values are
     * never reordered. The person's doing only where they cancelled it.
     */
    VISIT_CANCELLED,

    // What became of a confirmed booking, for a lead that could not book again
    // after it (2026-10-11). One per way a booking ends short of a move-in.

    /** The tenant cancelled their confirmed booking. Held without a token, that also closes their window. */
    BOOKING_CANCELLED_BY_TENANT,
    /** The property cancelled the confirmed booking. */
    BOOKING_CANCELLED_BY_PROPERTY,
    /** Nobody came on or after the move-in day. */
    DID_NOT_ARRIVE,
    /** The agreement was left unsigned for its three days. */
    DID_NOT_SIGN,
    /** They confirmed a booking somewhere else. */
    BOOKED_ELSEWHERE,
    /** The bed was still occupied after every retry and they opted out. */
    BED_NOT_READY,
    /** The property could not host for another reason. */
    PROPERTY_COULD_NOT_HOST;

    /**
     * Ended for the person's own reason whoever looks: they did not engage,
     * dropped their visit, let the days to book run out, or walked away from a
     * booking (user, 2026-10-17). {@link #NO_REPLY}, {@link #VISIT_CANCELLED}
     * and {@link #BOOKING_WINDOW_EXPIRED} can be either side's, and the
     * pipeline looks closer at those. Never the property not responding,
     * cancelling or being unable to host, and never a move-in.
     */
    public boolean isAlwaysTheProspects() {
        return switch (this) {
            case NO_VISIT_BOOKED, NOT_INTERESTED, NO_ANSWER_AFTER_MISSED_VISIT, NOT_SURE_EXPIRED,
                    BOOKING_WINDOW_EXPIRED, NO_LONGER_LOOKING, BOOKING_CANCELLED_BY_TENANT, DID_NOT_ARRIVE,
                    DID_NOT_SIGN, BOOKED_ELSEWHERE -> true;
            case NO_REPLY, VISIT_CANCELLED, REVIEW_OVERDUE, SPAM, DUPLICATE, CONVERTED,
                    BOOKING_CANCELLED_BY_PROPERTY, BED_NOT_READY, PROPERTY_COULD_NOT_HOST -> false;
        };
    }
}
