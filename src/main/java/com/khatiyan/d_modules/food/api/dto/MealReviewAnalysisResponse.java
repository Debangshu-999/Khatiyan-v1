package com.khatiyan.d_modules.food.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * One week's reading of the written reviews (user, 2026-11-01).
 *
 * <p>{@code stored} is false for a week with no written reviews: its lines come from
 * the ratings, no AI ran, and the week's turn is not used, so {@code generatedOn}
 * and {@code expiresOn} are empty.
 */
public record MealReviewAnalysisResponse(
        boolean stored,
        LocalDate generatedOn,
        LocalDate expiresOn,
        int reviewsRead,
        List<Reading> plans,
        List<Reading> dishes
) {

    /**
     * {@code line} is one short paragraph: the AI's review, with key words between double
     * asterisks, or the generic line when nobody wrote about it. {@code rating} is out of 5:
     * the AI's own score for its review, or the tenants' average behind a generic line.
     */
    public record Reading(UUID id, String name, Double rating, String line) {
    }
}
