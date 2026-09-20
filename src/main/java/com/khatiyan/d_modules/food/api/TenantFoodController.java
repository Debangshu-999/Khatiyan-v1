package com.khatiyan.d_modules.food.api;

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
import org.springframework.web.bind.annotation.RestController;

import com.khatiyan.c_shared.identity.UserPrincipal;
import com.khatiyan.d_modules.food.api.dto.FoodProfileMenuResponse;
import com.khatiyan.d_modules.food.api.dto.FoodProfileResponse;
import com.khatiyan.d_modules.food.api.dto.FoodSubscriptionResponse;
import com.khatiyan.d_modules.food.api.dto.SubscribeFoodProfileRequest;
import com.khatiyan.d_modules.food.api.dto.TenantFoodAvailabilityResponse;
import com.khatiyan.d_modules.food.service.FoodSubscriptionService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/food/me")
public class TenantFoodController {

    private final FoodSubscriptionService subscriptionService;

    public TenantFoodController(FoodSubscriptionService subscriptionService) {
        this.subscriptionService = subscriptionService;
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
    public ResponseEntity<FoodSubscriptionResponse> current(
            @AuthenticationPrincipal UserPrincipal user) {
        return subscriptionService.current(user.userId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/subscription")
    public FoodSubscriptionResponse subscribe(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody SubscribeFoodProfileRequest request) {
        return subscriptionService.subscribe(user.userId(), request);
    }

    @DeleteMapping("/subscription")
    public ResponseEntity<Void> unsubscribe(
            @AuthenticationPrincipal UserPrincipal user) {
        subscriptionService.unsubscribe(user.userId());
        return ResponseEntity.noContent().build();
    }
}
