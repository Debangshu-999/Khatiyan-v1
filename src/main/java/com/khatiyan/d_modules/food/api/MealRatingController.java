package com.khatiyan.d_modules.food.api;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.food.api.dto.MealRatingPromptResponse;
import com.khatiyan.d_modules.food.api.dto.MealRatingsSummaryResponse;
import com.khatiyan.d_modules.food.api.dto.MealReviewAnalysisResponse;
import com.khatiyan.d_modules.food.api.dto.MealReviewAnalysisStatusResponse;
import com.khatiyan.d_modules.food.api.dto.SubmitMealRatingRequest;
import com.khatiyan.d_modules.food.service.MealRatingService;

/** A tenant rating their last meal, and the owner's ratings and weekly AI reading (2026-11-01). */
@RestController
@RequestMapping("/api/v1")
public class MealRatingController {

    private final MealRatingService ratings;

    public MealRatingController(MealRatingService ratings) {
        this.ratings = ratings;
    }

    /** The meal on offer. Null when there is none. */
    @GetMapping("/food/me/meal-rating")
    public MealRatingPromptResponse myPrompt(@AuthenticationPrincipal UserPrincipal user) {
        return ratings.myPrompt(user.userId());
    }

    @PostMapping("/food/me/meal-rating")
    public ResponseEntity<Void> submit(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody SubmitMealRatingRequest request) {
        ratings.submit(user.userId(), request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/properties/{propertyId}/food/ratings")
    public MealRatingsSummaryResponse summary(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return ratings.summary(user.userId(), propertyId);
    }

    @GetMapping("/properties/{propertyId}/food/ratings/analysis")
    public MealReviewAnalysisStatusResponse analysis(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return ratings.analysisStatus(user.userId(), propertyId);
    }

    @PostMapping("/properties/{propertyId}/food/ratings/analysis")
    public MealReviewAnalysisResponse generate(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return ratings.generate(user.userId(), propertyId);
    }
}
