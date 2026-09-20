package com.khatiyan.d_modules.food.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.food.model.FoodQuantityUnit;
import com.khatiyan.d_modules.property.model.MealType;

public record CookingForecastResponse(
        UUID propertyId,
        LocalDate date,
        MealType mealType,
        int totalSubscribers,
        List<ProfileForecast> profiles,
        List<ConsolidatedItemForecast> consolidatedItems,
        /**
         * Items the owner marked unavailable for THIS date.
         *
         * <p>Returned rather than silently omitted. They are left out of every
         * quantity above, but a dish that vanished with no trace is one the
         * owner cannot put back — and cannot tell apart from one they forgot
         * to put on the menu.
         */
        List<SkippedItem> unavailableItems
) {
    public record SkippedItem(
            UUID itemId,
            String itemName,
            FoodQuantityUnit quantityUnit
    ) {
    }
    public record ProfileForecast(
            UUID profileId,
            String profileName,
            int subscriberCount,
            List<ItemForecast> items
    ) {
    }

    public record ItemForecast(
            UUID itemId,
            String itemName,
            FoodQuantityUnit quantityUnit,
            BigDecimal targetQuantity
    ) {
    }

    public record ConsolidatedItemForecast(
            UUID itemId,
            String itemName,
            FoodQuantityUnit quantityUnit,
            BigDecimal targetQuantity,
            List<ProfileQuantity> profileBreakdown
    ) {
    }

    public record ProfileQuantity(
            UUID profileId,
            String profileName,
            BigDecimal targetQuantity
    ) {
    }
}
