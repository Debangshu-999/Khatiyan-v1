package com.khatiyan.d_modules.food.api.dto;

import java.util.Set;

import com.khatiyan.d_modules.food.model.FoodQuantityUnit;
import com.khatiyan.d_modules.property.model.MealType;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SaveFoodItemRequest(
        @NotBlank @Size(max = 100) String name,
        @Size(max = 500) String description,
        @Size(max = 600) String imageUrl,
        @Size(max = 255) String imagePublicId,
        @NotNull FoodQuantityUnit quantityUnit,
        /**
         * The meals this dish is served at, at least one.
         *
         * <p>An item tagged for nothing matches no meal and cannot be put on a
         * menu, so it would sit in the catalogue as something the owner could
         * see but never use.
         */
        @NotEmpty Set<MealType> mealTags
) {
}
