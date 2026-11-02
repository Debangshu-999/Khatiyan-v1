package com.khatiyan.d_modules.food.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * A tenant's pass for their next meal. {@code token} and {@code code} are null
 * until the meal starts, and once it has been scanned, when {@code attendedAt}
 * says when.
 */
public record MealPassResponse(
        MealPassState state,
        String propertyName,
        LocalDate date,
        MealType mealType,
        LocalTime startTime,
        LocalTime endTime,
        String profileName,
        String token,
        String code,
        Instant attendedAt
) {
}
