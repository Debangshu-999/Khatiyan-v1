package com.khatiyan.d_modules.lead.api.dto;

import java.time.LocalDate;
import java.time.LocalTime;

import jakarta.validation.constraints.NotNull;

/**
 * A date and one of the property's slots on it, named by when it starts.
 *
 * <p>By start time and not by number: slots are numbered in the order they
 * fall, so the owner adding an earlier one renumbers the rest.
 */
public record ScheduleVisitRequest(
        @NotNull(message = "Pick a date.")
        LocalDate date,
        @NotNull(message = "Pick a slot.")
        LocalTime slotStart) {
}
