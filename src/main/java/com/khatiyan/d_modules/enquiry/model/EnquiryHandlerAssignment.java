package com.khatiyan.d_modules.enquiry.model;

/** How an enquiry came to its handler. */
public enum EnquiryHandlerAssignment {

    /** They were the first to try to reach the enquirer. */
    FIRST_RESPONSE,

    /** The system gave it to them: in turns, or back to the owner when a manager left. */
    SYSTEM,

    /** The owner assigned it. */
    OWNER
}
