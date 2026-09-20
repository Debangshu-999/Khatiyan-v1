package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

import jakarta.validation.constraints.NotNull;

/** One item, off one date's cooking. The weekly menu is not touched. */
public record MarkItemUnavailableRequest(
        @NotNull UUID itemId,
        @NotNull LocalDate date,
        @NotNull MealType mealType
) {
}
