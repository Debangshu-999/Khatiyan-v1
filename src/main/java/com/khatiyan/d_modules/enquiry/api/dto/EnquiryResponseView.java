package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome;
import com.khatiyan.d_modules.enquiry.model.EnquiryCallResult;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponse;
import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;

/** The answer, as the owner's list shows it. */
public record EnquiryResponseView(
    UUID id,
    EnquiryResponseChannel channel,
    UUID respondedByUserId,
    String respondedByName,
    /** The owner's private note. Never shown to the enquirer. */
    String note,
    Instant respondedAt,
    EnquiryAttemptOutcome outcome,
    Instant settledAt,
    // How a call went and how long it ran, when the handler recorded them.
    EnquiryCallResult callResult,
    Integer durationSeconds
) {
    public static EnquiryResponseView of(EnquiryResponse response, String respondedByName) {
        return new EnquiryResponseView(
                response.getId(),
                response.getChannel(),
                response.getRespondedByUserId(),
                respondedByName,
                response.getNote(),
                response.getCreatedAt(),
                response.getOutcome(),
                response.getSettledAt(),
                response.getCallResult(),
                response.getDurationSeconds());
    }
}
