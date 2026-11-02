package com.khatiyan.d_modules.food.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * Who ate at one meal. {@code notAttended} reads as "not yet scanned" while the
 * meal is open and as skipped after it, and is empty for a meal not recorded.
 */
public record MealAttendanceMealResponse(
        LocalDate date,
        MealType mealType,
        MealAttendanceState state,
        boolean recorded,
        long expected,
        List<Person> attended,
        List<Person> notAttended
) {

    public record Person(UUID tenancyId, String tenantName, String tenantPhotoUrl, String roomNumber, String profileName, Instant attendedAt) {
    }
}
