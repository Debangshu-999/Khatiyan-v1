package com.khatiyan.d_modules.enquiry.api.dto;

import com.khatiyan.d_modules.enquiry.model.EnquiryAttemptOutcome;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * The handler's answer to "Did they respond?" about a call.
 *
 * @param outcome SUCCEEDED when they spoke, FAILED when it did not connect
 * @param note    optional either way: talking points, or why it failed
 */
public record SettleEnquiryAttemptRequest(
        @NotNull(message = "Say whether they responded.")
        EnquiryAttemptOutcome outcome,
        @Size(max = 500, message = "The note can be at most 500 characters.")
        String note) {
}
