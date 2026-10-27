package com.khatiyan.d_modules.lead.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.a_auth.model.Gender;
import com.khatiyan.d_modules.billing.model.ManualPaymentMethod;
import com.khatiyan.d_modules.booking.model.BookingReachedVia;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Someone who booked in person or by phone, recorded by the property as a
 * confirmed booking (2026-10-19). The booking's own rules apply: the move-in
 * window, the gender the property takes, an adult, a bed free.
 *
 * @param monthlyRentPaise the room's rent when absent
 * @param depositPaise     the property's deposit when absent
 * @param tokenPaise       the token paid. Required where the property takes one
 */
public record CreateExternalBookingRequest(
        @NotBlank(message = "Enter their name.") @Size(max = 120) String name,
        @NotBlank(message = "Enter their phone number.") String phone,
        @NotNull(message = "Choose their gender.") Gender gender,
        @NotNull(message = "Enter their date of birth.") LocalDate dateOfBirth,
        @NotNull(message = "Say how they reached out.") BookingReachedVia reachedVia,
        @NotNull(message = "Choose a bed.") UUID roomId,
        @NotNull(message = "Choose a move-in date.") LocalDate moveInDate,
        Long monthlyRentPaise,
        Long depositPaise,
        Integer agreementMonths,
        Long tokenPaise,
        ManualPaymentMethod tokenMethod,
        @Size(max = 80) String tokenReference) {
}
