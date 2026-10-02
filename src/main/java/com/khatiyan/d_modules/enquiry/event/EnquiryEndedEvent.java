package com.khatiyan.d_modules.enquiry.event;

import java.time.Instant;
import java.util.UUID;

/**
 * The handler ended the conversation. The enquiry's window closed with it.
 *
 * <p>Different from expiring: nobody ran out of time, a person decided.
 */
public record EnquiryEndedEvent(
        UUID enquiryId,
        UUID propertyId,
        UUID enquirerUserId,
        Instant endedAt) {
}
