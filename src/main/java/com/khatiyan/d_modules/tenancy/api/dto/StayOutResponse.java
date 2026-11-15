package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * One of the tenant's stay outs. {@code state} is UPCOMING before the leaving
 * day, AWAY from it to the return day, DONE after. Once the leaving day has
 * passed only the return can change, and it can no longer be cancelled.
 */
public record StayOutResponse(
        UUID id,
        LocalDate leaveDate,
        MealType lastMealHere,
        LocalDate returnDate,
        MealType firstMealBack,
        String reason,
        String state,
        boolean canChangeLeaving,
        boolean canCancel) {
}
