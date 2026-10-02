package com.khatiyan.d_modules.enquiry.api.dto;

/** What someone is to an enquiry. Decides what they may do with it. */
public enum EnquiryParty {

    /** The person who asked. */
    ENQUIRER,

    /** In the property's management and allowed to act on it: its handler, or the owner. */
    ACTING_MANAGEMENT,

    /** In the property's management, reading an enquiry somebody else handles. */
    OTHER_MANAGEMENT,

    /** Nobody to this enquiry. */
    OUTSIDER
}
