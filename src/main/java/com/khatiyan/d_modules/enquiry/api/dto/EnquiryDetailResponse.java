package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;

/**
 * One enquiry as management reads it.
 *
 * <p>Carries the enquirer's contact details because answering means contacting
 * them — that is the entire point of the record. {@code enquirerEmail} is null
 * unless the address is present AND verified, so the respond sheet cannot offer
 * a channel that would go nowhere.
 */
public record EnquiryDetailResponse(
    UUID id,
    UUID propertyId,
    String message,
    EnquiryStatus status,
    Instant createdAt,

    /**
     * When this stops being actionable — shown on the card as "Expires on".
     *
     * <p>Sent even once it has passed, because the card goes on displaying it
     * for a further day while the enquiry sits greyed out.
     */
    Instant expiresAt,

    UUID enquirerUserId,
    String enquirerName,
    String enquirerPhone,
    /** Null unless registered and verified. */
    String enquirerEmail,

    /** Exactly the channels the respond sheet may enable. */
    List<ReachableChannelResponse> reachableChannels,

    /**
     * Every action taken on this enquiry, newest first — the action log.
     *
     * <p>A list rather than a single latest response because responding is
     * repeatable: an owner may call, then call again, then write. Empty while the
     * enquiry is still open.
     */
    List<EnquiryResponseView> responses
) {}
