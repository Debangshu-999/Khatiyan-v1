package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

/** The one meal on offer for this tenant to rate, with the dishes on their plan. */
public record MealRatingPromptResponse(LocalDate date, MealType mealType, List<Dish> dishes) {

    public record Dish(UUID itemId, String name) {
    }
}
