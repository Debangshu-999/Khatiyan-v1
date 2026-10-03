package com.khatiyan.d_modules.lead.model;

/**
 * Why a record closed.
 *
 * <p>The whole list from the design is declared now, though only the first is
 * reached today. They are stored values, and a stored value is never renamed or
 * removed once written.
 */
public enum LeadCloseReason {

    /** No attempt to reach them succeeded in the enquiry's 30 days. */
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

    /** No booking in the 15 days after becoming an advanced lead. */
    BOOKING_WINDOW_EXPIRED,

    /** The prospect stepped out. */
    NO_LONGER_LOOKING,

    /** Set by the owner. */
    SPAM,

    /** Set by the owner. */
    DUPLICATE,

    /** They moved in. */
    CONVERTED,

    /**
     * Their visit was cancelled and their enquiry's window closed with no
     * other booked (owner's rule, 2026-10-03). Appended: stored values are
     * never reordered.
     */
    VISIT_CANCELLED
}
