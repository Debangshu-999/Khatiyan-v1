package com.khatiyan.d_modules.property.api.dto;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

/**
 * Visit slots for some days of the week (2026-09-30): "Create for all days"
 * sends all seven, "Create for chosen days" the ones picked. Those days'
 * current slots are replaced. The visitors-per-slot limit belongs to those
 * chosen days, so Monday and Tuesday may have different capacities.
 *
 * <p>{@code visitorsPerSlot} is boxed: Jackson 3 refuses a whole body when a
 * primitive is missing, and a missing number should read as a clear message.
 */
public record SaveVisitSlotsRequest(
        @NotEmpty(message = "Choose at least one day") Set<DayOfWeek> days,
        @NotEmpty(message = "Add at least one slot") List<@Valid @NotNull SlotInput> slots,
        @NotNull(message = "Set how many visitors a slot takes") Integer visitorsPerSlot) {

    public record SlotInput(
            @NotNull(message = "Pick a start time") LocalTime startTime,
            @NotNull(message = "Pick an end time") LocalTime endTime) {
    }
}
