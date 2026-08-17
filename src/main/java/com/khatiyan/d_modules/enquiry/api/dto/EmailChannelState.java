package com.khatiyan.d_modules.enquiry.api.dto;

/**
 * Why email is or is not on offer.
 *
 * <p>{@link #reachableChannels} answers "can they be emailed"; this answers "and
 * if not, what should they do about it" — the two are different questions, and
 * a missing address and an unverified one need different advice.
 */
public enum EmailChannelState {

    /** Registered and verified. Email appears in the reachable channels. */
    AVAILABLE,

    /** An address is on file but nobody has proved they can read it. */
    UNVERIFIED,

    /** No address at all. */
    NOT_REGISTERED
}
