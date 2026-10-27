package com.khatiyan.d_modules.lead.model;

/**
 * Why an open lead is going cold: what on it runs out soon, or waits on the
 * property (user, 2026-10-11). Worked out when the lead is read and never
 * stored, so the thresholds can be tuned without touching a row.
 */
public enum LeadColdReason {

    /** Their visit was missed, and "still interested?" has little time left. */
    MISSED_VISIT_UNANSWERED,

    /** The days to book after their visit are nearly over, and no request is live. */
    BOOKING_WINDOW_CLOSING,

    /** Their booking has waited on the property: a request to answer, a payment to check, or a booking to confirm. */
    BOOKING_WAITING_ON_PROPERTY,

    /** Their token falls due soon, and they have not said they paid. */
    TOKEN_DUE_SOON,

    /** The move-in day has passed, and nobody has onboarded them. */
    MOVE_IN_OVERDUE
}
