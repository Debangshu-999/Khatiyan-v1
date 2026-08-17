package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * What the enquirer gets back, and exactly what their confirmation dialog needs:
 * who will be in touch, and on which channels.
 *
 * <p>The channels come from the server rather than being read off the client's
 * cached profile, so "they can email you" is decided by the same rule that
 * decides whether the owner is allowed to pick email.
 */
public record EnquiryReceiptResponse(
    UUID enquiryId,
    UUID propertyId,
    String propertyName,
    Instant createdAt,
    List<ReachableChannelResponse> reachableChannels,

    /**
     * Lets the dialog's footnote tell them to <em>register and verify</em> an
     * address or merely to <em>verify</em> the one they have. Advising someone
     * to add an email they already added is the kind of small wrongness that
     * makes an app feel like it is not paying attention.
     */
    EmailChannelState emailChannelState
) {}
