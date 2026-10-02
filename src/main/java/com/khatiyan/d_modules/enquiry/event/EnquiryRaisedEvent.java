package com.khatiyan.d_modules.enquiry.event;

import java.time.Instant;
import java.util.UUID;

/** A prospective tenant asked about a property. The leads pipeline opens or joins its record on this. */
public record EnquiryRaisedEvent(
        UUID enquiryId,
        UUID propertyId,
        UUID enquirerUserId,
        Instant raisedAt) {
}
