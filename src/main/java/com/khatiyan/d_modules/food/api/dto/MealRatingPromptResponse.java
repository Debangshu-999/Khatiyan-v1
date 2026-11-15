package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

/** The one meal on offer for this tenant to rate, with the dishes on their plan. */
public record MealRatingPromptResponse(
        LocalDate date,
        MealType mealType,
        List<Dish> dishes,
        /** Everyone's average for this meal so far, one decimal, or null before any rating (2026-11-09). */
        Double averageRating,
        /**
         * What this tenant gave it, empty before they rate. Rated, the meal stays on
         * offer to be changed until the next one starts (user, 2026-11-14).
         */
        List<MyRating> mine) {

    public record Dish(UUID itemId, String name) {
    }

    /** One of this tenant's own dish ratings, only ever sent back to them. */
    public record MyRating(UUID itemId, int rating, String review) {
    }
}
