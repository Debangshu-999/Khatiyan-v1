package com.khatiyan.d_modules.food.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.food.api.dto.FoodProfileMenuResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileResponse;
import com.khatiyan.d_modules.food.api.dto.FoodPlanResponse;
import com.khatiyan.d_modules.food.api.dto.SubscribeFoodProfileRequest;
import com.khatiyan.d_modules.food.api.dto.TenantFoodAvailabilityResponse;
import com.khatiyan.d_modules.food.api.dto.CookingForecastResponse;
import com.khatiyan.d_modules.food.service.FoodForecastService;
import com.khatiyan.d_modules.food.service.FoodSubscriptionService;
import com.khatiyan.d_modules.property.model.MealType;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/food/me")
public class TenantFoodController {

    private final FoodSubscriptionService subscriptionService;
    private final FoodForecastService forecastService;

    public TenantFoodController(FoodSubscriptionService subscriptionService, FoodForecastService forecastService) {
        this.subscriptionService = subscriptionService;
        this.forecastService = forecastService;
    }

    /**
     * Dishes taken off one meal on one date at the tenant's own property, for
     * the "today" section of their food screen. The property comes from their
     * active stay, never from the caller. Empty when food is not managed here.
     */
    @GetMapping("/skips")
    public List<CookingForecastResponse.SkippedItem> skippedItems(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam LocalDate date,
            @RequestParam MealType mealType) {
        TenantFoodAvailabilityResponse availability = subscriptionService.availability(user.userId());
        if (!availability.moduleEnabled()) {
            return List.of();
        }
        return forecastService.skippedItems(availability.propertyId(), date, mealType);
    }

    @GetMapping
    public TenantFoodAvailabilityResponse availability(
            @AuthenticationPrincipal UserPrincipal user) {
        return subscriptionService.availability(user.userId());
    }

    @GetMapping("/profiles")
    public List<FoodProfileResponse> availableProfiles(
            @AuthenticationPrincipal UserPrincipal user) {
        return subscriptionService.listAvailableProfiles(user.userId());
    }

    @GetMapping("/profiles/{profileId}/menu")
    public FoodProfileMenuResponse profileMenu(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID profileId) {
        return subscriptionService.getAvailableProfileMenu(user.userId(), profileId);
    }

    @GetMapping("/subscription")
    public ResponseEntity<FoodPlanResponse> current(
            @AuthenticationPrincipal UserPrincipal user) {
        return subscriptionService.current(user.userId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/subscription")
    public FoodPlanResponse subscribe(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody SubscribeFoodProfileRequest request) {
        return subscriptionService.subscribe(user.userId(), request);
    }

    /** Returns the plan, so the screen can say it ends tonight (2026-09-29). */
    @DeleteMapping("/subscription")
    public FoodPlanResponse unsubscribe(
            @AuthenticationPrincipal UserPrincipal user) {
        return subscriptionService.unsubscribe(user.userId());
    }
}
