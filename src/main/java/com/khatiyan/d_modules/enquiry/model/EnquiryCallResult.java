package com.khatiyan.d_modules.enquiry.model;

/**
 * How a call went, as the handler records it in "Record response" (owner's
 * design, 2026-10-03).
 *
 * <p>The first two end the call as a failed attempt. The two accepted ones end
 * it as a success, and say what the handler made of the enquirer.
 */
public enum EnquiryCallResult {

    /** Nobody picked up. */
    NO_ANSWER(false, null),

    /** They declined the call. */
    REJECTED(false, null),

    /** They spoke, and are interested. */
    ACCEPTED_INTERESTED(true, EnquirySentiment.INTERESTED),

    /** They spoke, and are not interested. */
    ACCEPTED_NOT_INTERESTED(true, EnquirySentiment.NOT_INTERESTED);

    private final boolean reached;
    private final EnquirySentiment sentiment;

    EnquiryCallResult(boolean reached, EnquirySentiment sentiment) {
        this.reached = reached;
        this.sentiment = sentiment;
    }

    /** Whether the call reached them: a successful attempt. */
    public boolean reached() {
        return reached;
    }

    /** The handler's reading it carries, or null for a call that did not connect. */
    public EnquirySentiment sentiment() {
        return sentiment;
    }

    public EnquiryAttemptOutcome outcome() {
        return reached ? EnquiryAttemptOutcome.SUCCEEDED : EnquiryAttemptOutcome.FAILED;
    }
}
