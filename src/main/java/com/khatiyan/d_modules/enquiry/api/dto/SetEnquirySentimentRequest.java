package com.khatiyan.d_modules.enquiry.api.dto;

import com.khatiyan.d_modules.enquiry.model.EnquirySentiment;

import jakarta.validation.constraints.NotNull;

/** The handler's reading of the enquirer: interested or not. */
public record SetEnquirySentimentRequest(
        @NotNull(message = "Choose Interested or Not interested.")
        EnquirySentiment sentiment) {
}
