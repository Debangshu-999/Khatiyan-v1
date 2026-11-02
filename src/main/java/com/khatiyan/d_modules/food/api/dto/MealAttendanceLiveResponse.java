package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalTime;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * What every owner and manager needs at a meal: whether attendance is on, and
 * the meal open for scanning now, if any.
 */
public record MealAttendanceLiveResponse(boolean enabled, OpenMeal openMeal) {

    public record OpenMeal(MealType mealType, LocalTime startTime, LocalTime endTime, long attended, long expected) {
    }
}
