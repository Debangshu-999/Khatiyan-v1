package com.khatiyan.d_modules.enquiry.api.dto;

import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;

/**
 * One row of the consent modal's channel selector.
 *
 * <p>Every channel appears whether or not it can be used, so the screen can say
 * WHY email is off rather than silently omitting it — an absent row reads as a
 * bug, a disabled row with a reason reads as a next step.
 */
public record EnquiryChannelOption(

    EnquiryResponseChannel channel,

    /**
     * The number or address this channel would share, for the row's subtitle.
     *
     * <p>Null when unavailable, and null for CHAT, which shares nothing. It is
     * the enquirer's own detail being shown back to them, so it is not withheld
     * the way management's copy of it is.
     */
    String target,

    /** False when there is nothing to share yet — an absent or unverified email. */
    boolean available,

    /** True when a live consent row exists, or always for a locked channel. */
    boolean granted,

    /**
     * True for a channel the enquirer does not get to decide about.
     *
     * <p>Only CHAT. It is the medium an enquiry lives in rather than a contact
     * detail handed over, so it is always on, never stored, and never revocable
     * — without it an enquiry is a message with no reply path. The flag is here
     * rather than the client testing for CHAT itself, so the product rule stays
     * on the server with the rest of the reachability rules.
     */
    boolean locked
) {}
