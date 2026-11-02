package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

/** Boxed rating: Jackson 3 refuses a whole body over a missing primitive, and the service says what is wrong. */
public record SubmitMealRatingRequest(LocalDate date, MealType mealType, List<Entry> ratings) {

    public record Entry(UUID itemId, Integer rating, String review) {
    }
}
