package com.khatiyan.d_modules.food.api.dto;

/**
 * A tenant's food plan as it stands (2026-09-29).
 *
 * @param today        what they eat today, or null
 * @param fromTomorrow a change that starts after midnight, or null
 * @param endsTonight  today's plan stops tonight and nothing follows it
 */
public record FoodPlanResponse(
        FoodPlanVersionResponse today,
        FoodPlanVersionResponse fromTomorrow,
        boolean endsTonight) {
}
