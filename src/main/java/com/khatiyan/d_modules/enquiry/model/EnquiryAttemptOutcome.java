package com.khatiyan.d_modules.enquiry.model;

/**
 * How an attempt to reach an enquirer ended.
 *
 * <p>{@code OPEN} is shown to people as "Pending". A call stays open until the
 * handler says whether the enquirer responded. A chat message stays open until
 * the enquirer replies, or the enquiry expires and the attempt fails with it.
 */
public enum EnquiryAttemptOutcome {
    OPEN,
    SUCCEEDED,
    FAILED
}
