package com.khatiyan.d_modules.food.api.dto;

import java.time.Instant;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * Who was just scanned, for the person serving: their name, room and plan, so
 * they plate the right food, and the meal's running count.
 */
public record MealScanResponse(
        String tenantName,
        String roomNumber,
        String profileName,
        String profileCategory,
        MealType mealType,
        Instant attendedAt,
        /** True when this pass had been scanned before: nothing new was recorded. */
        boolean alreadyRecorded,
        long attended,
        long expected
) {
}
