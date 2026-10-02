package com.khatiyan.d_modules.lead.api.dto;

import java.time.LocalDate;
import java.time.LocalTime;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Where a visit moves to.
 *
 * @param reason optional, kept on the lead's timeline
 */
public record RescheduleVisitRequest(
        @NotNull(message = "Pick a date.")
        LocalDate date,
        @NotNull(message = "Pick a slot.")
        LocalTime slotStart,
        @Size(max = 300, message = "The reason can be at most 300 characters.")
        String reason) {
}
