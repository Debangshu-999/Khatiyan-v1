package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.food.model.FoodDishType;
import com.khatiyan.d_modules.property.model.MealType;

/** The owner's daily view. Averages only: nothing here says who rated what, or what they wrote. */
public record MealRatingsSummaryResponse(
        Overall overall,
        List<PlanAnalytics> profileAnalytics,
        List<DishGroup> dishGroups
) {

    /** {@code rating} is the last 30 days. The three trends are the graph's modes. */
    public record Overall(Double rating, Double changeThisWeek, Trend thisWeek, Trend thisMonth, Trend thisYear) {
    }

    /** Points run in date order: a day each for a week, the Monday of each week for a month, the first of the month for a year. */
    public record Trend(Double rating, List<Point> points) {
    }

    public record Point(LocalDate date, Double rating) {
    }

    /** The plan's own rating over each of the three durations, and its meals over time. */
    public record PlanAnalytics(UUID profileId, String name, Double ratingThisWeek, Double ratingLastWeek,
            Double ratingThisMonth, Double ratingThisYear, List<MealAnalytics> meals) {
    }

    /** Only periods someone rated: by day, by the Monday of the week, by the first of the month. */
    public record MealAnalytics(MealType mealType, List<Cell> thisWeek, List<Cell> thisMonth, List<Cell> thisYear) {
    }

    public record Cell(LocalDate date, double rating, long people) {
    }

    public record DishGroup(FoodDishType type, List<DishRating> dishes) {
    }

    public record DishRating(UUID itemId, String name, DishPeriod thisWeek, Double lastWeek, DishPeriod thisMonth, DishPeriod thisYear) {
    }

    /** Empty when nobody rated it then. {@code change} is against the same length of time before, when both exist. */
    public record DishPeriod(Double rating, Double change) {
    }
}
