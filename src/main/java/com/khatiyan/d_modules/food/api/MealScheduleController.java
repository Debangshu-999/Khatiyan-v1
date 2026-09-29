package com.khatiyan.d_modules.food.api;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.food.api.dto.DelayMealRequest;
import com.khatiyan.d_modules.food.api.dto.MealScheduleResponse;
import com.khatiyan.d_modules.food.api.dto.SaveMealTimingsRequest;
import com.khatiyan.d_modules.food.api.dto.TenantFoodAvailabilityResponse;
import com.khatiyan.d_modules.food.service.FoodSubscriptionService;
import com.khatiyan.d_modules.food.service.MealScheduleService;

import jakarta.validation.Valid;

/** Meal timings, today's meals, and one-day delays (2026-09-28). */
@RestController
@RequestMapping("/api/v1")
@SuppressWarnings("null")
public class MealScheduleController {

    private final MealScheduleService scheduleService;
    private final FoodSubscriptionService subscriptionService;

    public MealScheduleController(MealScheduleService scheduleService, FoodSubscriptionService subscriptionService) {
        this.scheduleService = scheduleService;
        this.subscriptionService = subscriptionService;
    }

    @GetMapping("/properties/{propertyId}/food/meal-schedule")
    public MealScheduleResponse schedule(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId) {
        return scheduleService.schedule(user.userId(), propertyId);
    }

    @PutMapping("/properties/{propertyId}/food/meal-timings")
    public MealScheduleResponse saveTimings(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody SaveMealTimingsRequest request) {
        return scheduleService.saveTimings(user.userId(), propertyId, request);
    }

    @PostMapping("/properties/{propertyId}/food/meal-delays")
    public MealScheduleResponse delay(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID propertyId,
            @Valid @RequestBody DelayMealRequest request) {
        return scheduleService.delay(user.userId(), propertyId, request);
    }

    /**
     * The tenant's own property's meal day. The property comes from their
     * active stay, never from the caller. Null when there is no food there.
     */
    @GetMapping("/food/me/meal-schedule")
    public MealScheduleResponse mySchedule(@AuthenticationPrincipal UserPrincipal user) {
        TenantFoodAvailabilityResponse availability = subscriptionService.availability(user.userId());
        if (availability.propertyId() == null || !availability.foodAvailableInProperty()) {
            return null;
        }
        return scheduleService.scheduleForTenantProperty(availability.propertyId());
    }
}
