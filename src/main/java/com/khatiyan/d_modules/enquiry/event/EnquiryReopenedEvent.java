package com.khatiyan.d_modules.enquiry.event;

import java.time.Instant;
import java.util.UUID;

/** The enquirer reopened a closed enquiry with "Changed your mind?". */
public record EnquiryReopenedEvent(
        UUID enquiryId,
        UUID propertyId,
        UUID enquirerUserId,
        Instant reopenedAt) {
}
