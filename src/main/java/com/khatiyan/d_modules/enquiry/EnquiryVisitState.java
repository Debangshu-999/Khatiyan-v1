package com.khatiyan.d_modules.enquiry;

/** Where an enquiry's visit stands, as the leads pipeline knows it. */
public enum EnquiryVisitState {

    /** No visit was ever booked from it. */
    NONE,

    /** A visit is booked and not cancelled, its date passed or not. */
    SCHEDULED,

    /** Its visit was cancelled, and none is booked now. */
    CANCELLED,

    /** Its visitor was checked in at the property (2026-10-04). */
    VISITED,

    /** Nobody checked them in by midnight: No visit (2026-10-04). */
    MISSED
}
