package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * How many of those expected ate, per food profile and meal, over three durations
 * (user, 2026-11-02). Recorded meals only: a meal nobody scanned says nothing about who
 * ate. The columns are the periods of each duration, so a period with nothing recorded
 * still has its place: this week by day, the last 30 days by the week's Monday, this
 * year by the first of the month.
 */
public record MealAttendanceAnalyticsResponse(
        List<LocalDate> weekColumns,
        List<LocalDate> monthColumns,
        List<LocalDate> yearColumns,
        List<Plan> plans
) {

    public record Plan(UUID profileId, String name, List<Meal> meals) {
    }

    public record Meal(MealType mealType, List<Cell> thisWeek, List<Cell> thisMonth, List<Cell> thisYear) {
    }

    public record Cell(LocalDate date, long attended, long expected) {
    }
}
