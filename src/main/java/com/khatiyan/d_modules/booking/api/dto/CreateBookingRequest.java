package com.khatiyan.d_modules.booking.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.a_auth.model.Gender;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * What a tenant sends to ask for a bed.
 *
 * <p>It names an enquiry, never a visit or a property: the server reads the
 * attended visit and the property from the enquiry, so neither can be claimed.
 * Who is asking comes from the session, never from this body.
 *
 * @param exitRequestId     the bed being vacated that they chose, or null for
 *                          a bed that is free today
 * @param proposedRentPaise their own offer, or null to ask at the listed rent
 * @param agreementMonths   1 to 11, or null for an indefinite agreement
 * @param idempotencyKey    the app's key for this one tap of Send, so a retry
 *                          after a dropped connection is the same request
 */
public record CreateBookingRequest(
        @NotNull(message = "Choose the enquiry this booking follows")
        UUID enquiryId,

        @NotNull(message = "Choose a room")
        UUID roomId,

        UUID exitRequestId,

        @NotNull(message = "Choose a move-in date")
        LocalDate moveInDate,

        @Positive(message = "Monthly rent must be greater than zero")
        Long proposedRentPaise,

        Integer agreementMonths,

        @NotBlank(message = "Enter your name")
        @Size(max = 120, message = "Name is too long")
        String name,

        @NotBlank(message = "Enter your phone number")
        String phone,

        @Email(message = "Enter a valid email address")
        @Size(max = 254, message = "Email is too long")
        String email,

        @NotNull(message = "Select your gender")
        Gender gender,

        @NotNull(message = "Enter your date of birth")
        @Past(message = "Enter a valid date of birth")
        LocalDate dateOfBirth,

        @NotBlank(message = "This request could not be sent. Try again")
        @Size(max = 80)
        String idempotencyKey) {
}
