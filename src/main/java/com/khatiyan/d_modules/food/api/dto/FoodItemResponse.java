package com.khatiyan.d_modules.food.api.dto;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import com.khatiyan.d_modules.food.model.FoodItem;
import com.khatiyan.d_modules.food.model.FoodQuantityUnit;
import com.khatiyan.d_modules.property.model.MealType;

public record FoodItemResponse(
        UUID id,
        UUID propertyId,
        String name,
        String description,
        String imageUrl,
        String imagePublicId,
        FoodQuantityUnit quantityUnit,
        Set<MealType> mealTags,
        boolean active,
        boolean deleted,
        Instant createdAt,
        Instant updatedAt
) {
    public static FoodItemResponse from(FoodItem item) {
        return new FoodItemResponse(
                item.getId(),
                item.getPropertyId(),
                item.getName(),
                item.getDescription(),
                item.getImageUrl(),
                item.getImagePublicId(),
                item.getQuantityUnit(),
                item.getMealTags(),
                item.isCurrentlyActive(),
                item.isDeleted(),
                item.getCreatedAt(),
                item.getUpdatedAt());
    }
}
