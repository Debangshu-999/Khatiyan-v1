package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.model.EnquiryStatus;

/**
 * One enquiry as management reads it.
 *
 * <p>Carries the enquirer's contact details because answering means contacting
 * them — but only the ones they agreed to share. Both {@code enquirerPhone} and
 * {@code enquirerEmail} are read straight off {@code reachableChannels}, so a
 * detail is present here if and only if the respond sheet is allowed to use it.
 * The client is never handed something it would then be refused for using.
 *
 * <p>Phone was unconditional until enquiry channel consent landed, which is how
 * a responder ended up keeping a prospect's number permanently — saved,
 * messaged, reused, past anything this app could revoke.
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
    /** Null unless the enquirer has consented to being called. */
    String enquirerPhone,
    /** Null unless registered, verified, AND consented to. */
    String enquirerEmail,

    /** Exactly the channels the respond sheet may enable. */
    List<ReachableChannelResponse> reachableChannels,

    /**
     * The conversation this enquiry was answered in, once it has been.
     *
     * <p>Null until somebody answers over chat. The respond sheet reads it to
     * open the thread it just created, and the card reads it to offer a way back
     * into a conversation already under way — answering by chat a second time
     * would otherwise be the only route back to it.
     */
    UUID chatThreadId,

    /**
     * Every action taken on this enquiry, newest first — the action log.
     *
     * <p>A list rather than a single latest response because responding is
     * repeatable: an owner may call, then call again, then write. Empty while the
     * enquiry is still open.
     */
    List<EnquiryResponseView> responses
) {}
