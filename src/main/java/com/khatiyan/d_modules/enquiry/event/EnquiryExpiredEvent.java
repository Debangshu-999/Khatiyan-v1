package com.khatiyan.d_modules.enquiry.event;

import java.time.Instant;
import java.util.UUID;

/** An enquiry reached its last day with no attempt having succeeded. */
public record EnquiryExpiredEvent(
        UUID enquiryId,
        UUID propertyId,
        UUID enquirerUserId,
        Instant expiredAt) {
}
