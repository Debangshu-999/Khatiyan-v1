package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalTime;

import com.khatiyan.d_modules.property.model.MealType;

import jakarta.validation.constraints.NotNull;

/** Push one of today's meals later. The end moves by the same amount. */
public record DelayMealRequest(
        @NotNull(message = "Pick a meal") MealType mealType,
        @NotNull(message = "Pick a new start time") LocalTime newStartTime) {
}
