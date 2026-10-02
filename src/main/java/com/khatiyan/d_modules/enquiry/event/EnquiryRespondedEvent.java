package com.khatiyan.d_modules.enquiry.event;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;

/**
 * An attempt to reach the enquirer succeeded, so the enquiry is answered.
 *
 * <p>Published once per enquiry: the status only moves on the first success.
 * The tenant's time to book a visit runs from {@code respondedAt}.
 */
public record EnquiryRespondedEvent(
        UUID enquiryId,
        UUID propertyId,
        UUID enquirerUserId,
        EnquiryResponseChannel channel,
        Instant respondedAt) {
}
