package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * One call still waiting for "Did they respond?".
 *
 * <p>What the sheet needs and nothing more: who was called, when, and the two
 * ids and the version it sends back to settle it.
 *
 * @param enquiryVersion sent as If-Match when settling
 */
public record EnquiryCallToSettleResponse(
        UUID attemptId,
        UUID enquiryId,
        String enquirerName,
        UUID calledByUserId,
        String calledByName,
        Instant calledAt,
        String note,
        long enquiryVersion) {
}
