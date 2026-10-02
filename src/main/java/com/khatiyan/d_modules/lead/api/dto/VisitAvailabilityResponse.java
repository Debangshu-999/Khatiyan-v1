package com.khatiyan.d_modules.lead.api.dto;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/**
 * The dates and slots a visit can be booked into, with the places left in each.
 *
 * <p>From tomorrow to 30 days ahead. Only dates the property offers a slot on.
 *
 * @param configured false when the owner has not set any visit slots yet
 */
public record VisitAvailabilityResponse(UUID propertyId, boolean configured, List<Day> days) {

    public record Day(LocalDate date, List<Slot> slots) {
    }

    /**
     * @param capacity  how many visits the slot takes
     * @param spotsLeft capacity less the visits already booked into it. At 0 it cannot be picked
     */
    public record Slot(LocalTime startTime, LocalTime endTime, int capacity, int spotsLeft) {
    }
}
