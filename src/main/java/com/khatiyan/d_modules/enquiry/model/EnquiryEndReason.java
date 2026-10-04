package com.khatiyan.d_modules.enquiry.model;

/**
 * Why an enquiry ended: the pill on the owner's expired card (owner's design,
 * 2026-10-03). Stored when it ends, never worked out later.
 */
public enum EnquiryEndReason {

    /** Ran out unanswered, and nobody tried to reach them. */
    HANDLER_DID_NOT_RESPOND,

    /** Ran out unanswered, though attempts were made. */
    TENANT_DID_NOT_RESPOND,

    /** Closed by the handler as not interested, or ran out marked so. */
    NOT_INTERESTED,

    /** Answered, and ran out with no visit. */
    NO_VISIT_BOOKED,

    /** Answered, and its visit was cancelled and not booked again. */
    VISIT_CANCELLED,

    /** Answered, and ran out with a visit still booked. */
    VISIT_BOOKED,

    /**
     * Their visit became No visit, and they said they were no longer
     * interested or did not answer within the week (user, 2026-10-04).
     */
    VISIT_MISSED,

    /** They came, and the enquiry then ran out. */
    VISITED
}
