package com.khatiyan.d_modules.enquiry.api.dto;

import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;

/**
 * A way the enquirer can actually be reached, with the address to reach them at.
 *
 * <p>Sent to both sides from one place: the enquirer's confirmation dialog lists
 * these ("a call on +91…"), and the owner's respond sheet enables exactly these
 * options. Deriving it twice is how the two drift, and the drift shows up as an
 * owner promising an email nobody reads.
 *
 * <p>CHAT never appears here. It is not a channel anyone can be reached on yet.
 */
public record ReachableChannelResponse(
    EnquiryResponseChannel channel,
    /** The phone number or email address, for display. */
    String target
) {}
