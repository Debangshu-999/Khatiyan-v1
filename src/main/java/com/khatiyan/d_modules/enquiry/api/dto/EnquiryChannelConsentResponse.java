package com.khatiyan.d_modules.enquiry.api.dto;

import java.util.List;

/**
 * What an enquirer has agreed to be contacted on, and what they could agree to.
 *
 * <p>Both halves in one payload because the consent modal and the account
 * settings section each need both: the options to draw, and the state to draw
 * them in. Splitting them would make a screen that shows a granted channel it
 * has no label for.
 */
public record EnquiryChannelConsentResponse(

    /** Every grantable channel, in the order they should be listed. */
    List<EnquiryChannelOption> channels,

    /**
     * Why email is unavailable, when it is.
     *
     * <p>Carried alongside rather than folded into the option because
     * "no address" and "address not verified" send someone to two different
     * places, and a bare unavailable flag says neither.
     */
    EmailChannelState emailChannelState,

    /**
     * True when at least one channel is live.
     *
     * <p>What the enquire button checks to decide whether to open the consent
     * modal. Derived, but derived once here rather than in every caller.
     */
    boolean anyGranted,

    /** The wording a fresh grant would be stamped with. */
    String termsVersion
) {}
