package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * The enquirer's own view of a property: may I ask, and did I already?
 *
 * <p>Answered by the server rather than inferred on the client, because the same
 * rules that produce {@code canEnquire} are the ones the raise endpoint enforces
 * — owning the place, managing it, or already having an open question.
 */
public record MyEnquiryResponse(
    boolean canEnquire,
    /** Why not, in words the profile button can show. Null when they can. */
    String blockedReason,
    /** The open enquiry, if one exists. Null otherwise. */
    UUID openEnquiryId,
    Instant openEnquiryAt
) {
    public static MyEnquiryResponse allowed() {
        return new MyEnquiryResponse(true, null, null, null);
    }

    public static MyEnquiryResponse blocked(String reason) {
        return new MyEnquiryResponse(false, reason, null, null);
    }

    public static MyEnquiryResponse alreadyAsked(UUID enquiryId, Instant askedAt) {
        return new MyEnquiryResponse(false, "Enquiry sent", enquiryId, askedAt);
    }
}
