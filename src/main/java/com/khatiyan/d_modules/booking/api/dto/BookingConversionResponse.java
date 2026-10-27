package com.khatiyan.d_modules.booking.api.dto;

import java.util.UUID;

import com.khatiyan.d_modules.compliance.api.dto.OnboardTenancyWithAgreementResponse;

/**
 * A booking was converted: the stay and its agreement, as ordinary onboarding
 * answers, with the booking it came from.
 */
public record BookingConversionResponse(UUID bookingId, String referenceCode,
        OnboardTenancyWithAgreementResponse stay) {
}
