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
    VISIT_CANCELLED
}
