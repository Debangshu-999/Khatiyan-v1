package com.khatiyan.d_modules.enquiry.api.dto;

import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerMode;

import jakarta.validation.constraints.NotNull;

/**
 * The owner's choice of how enquiries find their handler.
 *
 * @param includeOwner whether the owner takes a turn when the system assigns.
 *                     Boxed, and false when left out: a missing primitive fails
 *                     the whole body under Jackson 3.
 */
public record EnquiryHandlerSettingsRequest(
        @NotNull(message = "Choose how enquiries are handled.")
        EnquiryHandlerMode mode,
        Boolean includeOwner) {

    public EnquiryHandlerSettingsRequest {
        includeOwner = includeOwner != null && includeOwner;
    }
}
