package com.khatiyan.d_modules.enquiry.api.dto;

import java.time.Instant;
import java.util.UUID;

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
    Instant respondedAt
) {
    public static EnquiryResponseView of(EnquiryResponse response, String respondedByName) {
        return new EnquiryResponseView(
                response.getId(),
                response.getChannel(),
                response.getRespondedByUserId(),
                respondedByName,
                response.getNote(),
                response.getCreatedAt());
    }
}
