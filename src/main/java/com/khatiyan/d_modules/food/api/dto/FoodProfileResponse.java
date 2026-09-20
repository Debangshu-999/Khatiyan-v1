package com.khatiyan.d_modules.food.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.food.model.FoodProfile;

public record FoodProfileResponse(
        UUID id,
        UUID propertyId,
        String name,
        String description,
        int displayOrder,
        Instant createdAt,
        Instant updatedAt
) {
    public static FoodProfileResponse from(FoodProfile profile) {
        return new FoodProfileResponse(
                profile.getId(),
                profile.getPropertyId(),
                profile.getName(),
                profile.getDescription(),
                profile.getDisplayOrder(),
                profile.getCreatedAt(),
                profile.getUpdatedAt());
    }
}
