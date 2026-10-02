package com.khatiyan.d_modules.enquiry.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerMode;
import com.khatiyan.d_modules.enquiry.model.EnquiryHandlerSettings;

/**
 * How a property chooses the handler of a new enquiry.
 *
 * @param configured false while the owner has never chosen. The mode is then the
 *                   default, first to respond, and there is no version to send.
 * @param version    sent back as If-Match on a change, null until configured
 */
public record EnquiryHandlerSettingsResponse(
        UUID propertyId,
        EnquiryHandlerMode mode,
        boolean includeOwner,
        boolean configured,
        Long version) {

    public static EnquiryHandlerSettingsResponse unset(UUID propertyId) {
        return new EnquiryHandlerSettingsResponse(propertyId, EnquiryHandlerMode.FIRST_RESPONSE, false, false, null);
    }

    public static EnquiryHandlerSettingsResponse of(EnquiryHandlerSettings settings) {
        return new EnquiryHandlerSettingsResponse(
                settings.getPropertyId(), settings.getMode(), settings.isIncludeOwner(), true, settings.getVersion());
    }
}
