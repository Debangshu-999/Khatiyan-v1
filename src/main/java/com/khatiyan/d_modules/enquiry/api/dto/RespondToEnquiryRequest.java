package com.khatiyan.d_modules.enquiry.api.dto;

import com.khatiyan.d_modules.enquiry.model.EnquiryResponseChannel;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Choosing a channel is the response. The note is optional and is for the
 * owner's own record — the enquirer is told the channel, not the note.
 */
public record RespondToEnquiryRequest(
    @NotNull(message = "Choose how you will get back to them.")
    EnquiryResponseChannel channel,

    @Size(max = 500, message = "The note can be at most 500 characters.")
    String note
) {}
