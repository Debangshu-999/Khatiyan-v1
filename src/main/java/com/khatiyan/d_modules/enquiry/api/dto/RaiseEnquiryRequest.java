package com.khatiyan.d_modules.enquiry.api.dto;

import com.khatiyan.d_modules.enquiry.model.Enquiry;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RaiseEnquiryRequest(
    @NotBlank(message = "Write what you would like to ask.")
    @Size(max = Enquiry.MAX_MESSAGE_LENGTH, message = "An enquiry can be at most 500 characters.")
    String message
) {}
