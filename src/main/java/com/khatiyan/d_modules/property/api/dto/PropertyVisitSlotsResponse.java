package com.khatiyan.d_modules.property.api.dto;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.PropertyVisitSettings;
import com.khatiyan.d_modules.property.model.VisitSlot;

/**
 * A property's visit slots (2026-09-30), all seven days Monday first. A day
 * with no slots takes no visits.
 *
 * <p>{@code version} is what a later save must send back as If-Match.
 */
public record PropertyVisitSlotsResponse(
        UUID propertyId,
        boolean configured,
        Long version,
        List<VisitDay> days) {

    public record VisitDay(DayOfWeek day, Integer visitorsPerSlot, List<Slot> slots) {
    }

    /** Numbered by start time on its day: Slot 1 is the earliest. */
    public record Slot(int number, LocalTime startTime, LocalTime endTime) {
    }

    public static PropertyVisitSlotsResponse notSetUp(UUID propertyId) {
        List<VisitDay> days = new ArrayList<>();
        for (DayOfWeek day : DayOfWeek.values()) {
            days.add(new VisitDay(day, null, List.of()));
        }
        return new PropertyVisitSlotsResponse(propertyId, false, null, days);
    }

    public static PropertyVisitSlotsResponse from(PropertyVisitSettings settings) {
        List<VisitDay> days = new ArrayList<>();
        for (DayOfWeek day : DayOfWeek.values()) {
            List<VisitSlot> onDay = settings.slotsOn(day);
            List<Slot> slots = new ArrayList<>();
            for (int index = 0; index < onDay.size(); index++) {
                VisitSlot slot = onDay.get(index);
                slots.add(new Slot(index + 1, slot.getStartTime(), slot.getEndTime()));
            }
            Integer visitorsPerSlot = onDay.isEmpty() ? null : onDay.getFirst().getVisitorsPerSlot();
            days.add(new VisitDay(day, visitorsPerSlot, slots));
        }
        return new PropertyVisitSlotsResponse(
                settings.getPropertyId(),
                true,
                settings.getVersion(),
                days);
    }
}
