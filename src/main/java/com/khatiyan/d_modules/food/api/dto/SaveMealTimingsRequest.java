package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalTime;
import java.util.List;

import com.khatiyan.d_modules.property.model.MealType;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

/** The property's meal timetable, whole. Meals left out keep their current time. */
public record SaveMealTimingsRequest(@NotEmpty @Valid List<Timing> timings) {

    public record Timing(
            @NotNull(message = "Pick a meal") MealType mealType,
            @NotNull(message = "Pick a start time") LocalTime startTime,
            @NotNull(message = "Pick an end time") LocalTime endTime) {
    }
}
