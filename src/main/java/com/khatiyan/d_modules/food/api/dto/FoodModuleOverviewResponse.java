package com.khatiyan.d_modules.food.api.dto;

import java.util.Set;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

public record FoodModuleOverviewResponse(
        UUID propertyId,
        boolean foodAvailableInProperty,
        boolean moduleEnabled,
        Set<MealType> availableMeals,
        long activeItems,
        long activeProfiles,
        long activeSubscriptions
) {
}
