package com.khatiyan.d_modules.enquiry.api.dto;

/** How an enquiry ended, as the action log names it (user, 2026-10-03). */
public enum EnquiryEndingKind {

    /** Closed as not interested: by someone, or by itself after 7 days. */
    CLOSED,

    /** Its date passed. */
    EXPIRED,

    /** The enquirer raised a new enquiry for the property, which expired this one. */
    EXPIRED_BY_DUPLICATE
}
