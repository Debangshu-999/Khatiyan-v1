package com.khatiyan.d_modules.booking.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.booking.model.BookingStatus;

/**
 * A person's booking at a property, for the onboarding screen to offer
 * "Convert the booking" in place of a second record. It carries the agreed
 * terms the stay will be built from, so the form can show them filled in.
 *
 * @param canConvertNow whether converting would go through at this moment
 * @param whyNot        what is in the way when it would not, as one sentence
 * @param version       the booking's version, sent back as If-Match when
 *                      converting. The person onboarding may not be able to
 *                      open the booking itself
 */
public record BookingConvertibleResponse(
        UUID requestId,
        String referenceCode,
        BookingStatus status,
        UUID roomId,
        String roomNumber,
        LocalDate moveInDate,
        Long agreedRentPaise,
        long depositPaise,
        Integer agreementMonths,
        String tenantName,
        Gender tenantGender,
        LocalDate tenantDateOfBirth,
        boolean canConvertNow,
        String whyNot,
        long version) {
}
