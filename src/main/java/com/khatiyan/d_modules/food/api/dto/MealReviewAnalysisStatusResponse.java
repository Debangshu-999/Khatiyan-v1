package com.khatiyan.d_modules.food.api.dto;

/** The analysis still in its week, if any, whether this is the owner, and whether they can generate one now. */
public record MealReviewAnalysisStatusResponse(MealReviewAnalysisResponse current, boolean owner, boolean canGenerate) {
}
