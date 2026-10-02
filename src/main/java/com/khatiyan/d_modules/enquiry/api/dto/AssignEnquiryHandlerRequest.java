package com.khatiyan.d_modules.enquiry.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/** The owner giving an enquiry to themselves or to a manager. */
public record AssignEnquiryHandlerRequest(
        @NotNull(message = "Choose who handles this enquiry.")
        UUID handlerUserId) {
}
