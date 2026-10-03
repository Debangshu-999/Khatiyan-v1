package com.khatiyan.d_modules.enquiry.api.dto;

/**
 * Where an enquiry stands for the person who raised it. Never the handler's
 * reading of them: a closed one only says it was closed.
 */
public enum MyEnquiryState {
    AWAITING_REPLY,
    ANSWERED,
    /** The property closed it. It reads so until its usual date. */
    CLOSED,
    EXPIRED
}
