package com.khatiyan.d_modules.lead.model;

/** What a timeline entry records. Stored, so entries are added and never renamed. */
public enum LeadActivityType {

    /** The enquiry that opened the record. */
    ENQUIRY_RAISED,

    /** A later enquiry from the same person, joined to the open record. */
    ENQUIRY_JOINED,

    /** The record got a handler, or a new one. */
    HANDLER_ASSIGNED,

    /** The first attempt to reach them succeeded. */
    RESPONDED,

    /** The record closed. The detail holds the reason. */
    CLOSED,

    /** A visit was booked. The detail holds the date and slot. */
    VISIT_SCHEDULED,

    /** A visit was moved. The detail holds where from and where to. */
    VISIT_RESCHEDULED,

    /** A visit was cancelled. The detail holds when it was to be. */
    VISIT_CANCELLED,

    /** Opened again: its enquiry was reopened after closing as not interested. */
    REOPENED,

    /** The visitor was checked in at the property. The detail holds the date and slot. */
    VISIT_ATTENDED,

    /** Nobody checked them in by midnight: No visit. The detail holds the date and slot. */
    VISIT_MISSED,

    // A booking's steps (2026-10-11). Each is linked to its booking and written
    // once per booking. The detail holds the booking's code.

    /** A booking request was sent. */
    BOOKING_REQUESTED,
    /** Its terms were agreed. Not booked yet where a token is still to come. */
    BOOKING_AGREED,
    /** The booking was confirmed. */
    BOOKING_CONFIRMED,
    /** The booking ended without a move-in. The detail also says how. */
    BOOKING_ENDED,
    /** The stay made from the booking became active. */
    MOVED_IN,
    /** This record follows an earlier one of the same person here. The detail holds that record's code. */
    RESUMED,
    /**
     * Opened as potential spam: the person walked away from three or more
     * earlier records here (user, 2026-10-17). The detail holds the latest
     * one's code. Written by the rule, never by hand.
     */
    MARKED_SPAM,
    /** Opened as a duplicate: one or two earlier records here. The detail holds the latest one's code. */
    MARKED_DUPLICATE
}
