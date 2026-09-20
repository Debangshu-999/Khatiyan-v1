package com.khatiyan.d_modules.food.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.model.FoodSubscription;

public record FoodSubscriptionResponse(
        UUID id,
        UUID propertyId,
        UUID tenancyId,
        UUID tenantUserId,
        UUID profileId,
        String profileName,
        Instant startedAt
) {
    public static FoodSubscriptionResponse from(FoodSubscription subscription, FoodProfile profile) {
        return new FoodSubscriptionResponse(
                subscription.getId(),
                subscription.getPropertyId(),
                subscription.getTenancyId(),
                subscription.getTenantUserId(),
                subscription.getProfileId(),
                profile.getName(),
                subscription.getStartedAt());
    }
}
