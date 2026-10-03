package com.khatiyan.d_modules.enquiry.event;

import java.time.Instant;
import java.util.UUID;

/**
 * An answered enquiry's date has passed.
 *
 * <p>The unanswered ones say so with {@link EnquiryExpiredEvent}, and the ended
 * ones with {@link EnquiryEndedEvent}. An answered one stays RESPONDED past its
 * date, so without this nobody would hear that its window closed. Sent once per
 * enquiry, by the hourly sweep.
 */
public record EnquiryWindowClosedEvent(
        UUID enquiryId,
        UUID propertyId,
        UUID enquirerUserId,
        Instant closedAt) {
}
