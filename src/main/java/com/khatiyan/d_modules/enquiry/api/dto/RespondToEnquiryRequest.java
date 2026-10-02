package com.khatiyan.d_modules.enquiry.api.dto;

import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Starts reaching out on a channel: CALL_BACK or CHAT.
 *
 * <p>The note is optional, is kept on a call attempt only, and is for
 * management's own record. The enquirer never sees it. How the call went is
 * said afterwards, with {@link SettleEnquiryAttemptRequest}.
 */
public record RespondToEnquiryRequest(
    @NotNull(message = "Choose how you will get back to them.")
    EnquiryResponseChannel channel,

    @Size(max = 500, message = "The note can be at most 500 characters.")
    String note
) {}
