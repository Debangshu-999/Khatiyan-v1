package com.khatiyan.d_modules.lead.api.dto;

import java.time.LocalDate;
import java.time.LocalTime;

import com.khatiyan.d_modules.lead.model.VisitImpression;
import com.khatiyan.d_modules.lead.model.VisitInterest;
import com.khatiyan.d_modules.property.model.SharingType;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * Someone who walked in and saw the place, recorded by the property
 * (2026-10-19). Only a visit that happened.
 *
 * @param visitedOn  today when absent, or an earlier day in the last 30
 * @param impression how they found it. Required, no default
 * @param interest   whether they are interested. Required, no default
 * @param dislikedReason why they did not like it: required with DISLIKED, ignored otherwise
 * @param wantedSharing and {@code budgetPaise}: asked, and kept, only when
 *                   interested is YES
 * @param slotStart  the slot of that day they came in, with {@code slotEnd}:
 *                   both or neither (user, 2026-10-19). Neither is the whole day
 */
public record RecordExternalVisitRequest(
        @NotBlank(message = "Enter their name.") @Size(max = 120) String name,
        @NotBlank(message = "Enter their phone number.") String phone,
        LocalDate visitedOn,
        LocalTime slotStart,
        LocalTime slotEnd,
        VisitImpression impression,
        @Size(max = 500, message = "Keep the reason under 500 characters.") String dislikedReason,
        VisitInterest interest,
        SharingType wantedSharing,
        @Positive(message = "Enter a budget above zero.") Long budgetPaise,
        @Size(max = 500, message = "Keep the note under 500 characters.") String note) {
}
