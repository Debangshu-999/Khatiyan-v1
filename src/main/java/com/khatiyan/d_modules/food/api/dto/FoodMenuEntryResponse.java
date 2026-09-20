package com.khatiyan.d_modules.food.api.dto;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.util.UUID;

import com.khatiyan.d_modules.food.model.FoodItem;
import com.khatiyan.d_modules.food.model.FoodMenuEntry;
import com.khatiyan.d_modules.food.model.FoodQuantityUnit;
import com.khatiyan.d_modules.property.model.MealType;

public record FoodMenuEntryResponse(
        UUID id,
        UUID propertyId,
        UUID profileId,
        UUID itemId,
        String itemName,
        String itemImageUrl,
        FoodQuantityUnit quantityUnit,
        DayOfWeek dayOfWeek,
        MealType mealType,
        BigDecimal baseQuantityPerSubscriber,
        BigDecimal repeatQuantity,
        int expectedRepeatPercentage,
        BigDecimal fixedBufferQuantity,
        BigDecimal batchSize,
        int displayOrder,
        /**
         * Whether the property still serves the meal this entry is for.
         *
         * <p>False is an orphan. Creating an entry checks that the property
         * offers that meal, but nothing revisits existing entries when an owner
         * later stops serving dinner — the rows stay active, the forecast
         * refuses that meal outright, and without this flag the only clue was a
         * refusal on a different screen.
         *
         * <p>Reported rather than cleaned up automatically: the owner may be
         * pausing dinner for a month, and silently deleting a week of menu work
         * they would have to retype is worse than showing them what is stale.
         */
        boolean mealStillServed,
        Instant createdAt,
        Instant updatedAt
) {
    public static FoodMenuEntryResponse from(FoodMenuEntry entry, FoodItem item, boolean mealStillServed) {
        return new FoodMenuEntryResponse(
                entry.getId(),
                entry.getPropertyId(),
                entry.getProfileId(),
                entry.getItemId(),
                item.getName(),
                item.getImageUrl(),
                item.getQuantityUnit(),
                entry.getDayOfWeek(),
                entry.getMealType(),
                entry.getBaseQuantityPerSubscriber(),
                entry.getRepeatQuantity(),
                entry.getExpectedRepeatPercentage(),
                entry.getFixedBufferQuantity(),
                entry.getBatchSize(),
                entry.getDisplayOrder(),
                mealStillServed,
                entry.getCreatedAt(),
                entry.getUpdatedAt());
    }
}
