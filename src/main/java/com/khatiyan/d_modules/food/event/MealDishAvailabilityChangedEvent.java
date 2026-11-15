package com.khatiyan.d_modules.food.event;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * A dish was taken off one day's meal, or put back on it (P1.5.h, 2026-11-08).
 *
 * <p>Carries the tenants whose plan serves that dish at that meal on that day,
 * worked out when the owner pressed the button, so the listener tells exactly
 * them. Putting a dish back reaches the same people, because a dish can only
 * come off on the day itself and plan changes wait for midnight.
 */
public record MealDishAvailabilityChangedEvent(
        UUID propertyId,
        String propertyName,
        LocalDate mealDate,
        MealType mealType,
        String itemName,
        /** True when it was put back on, false when it was taken off. */
        boolean available,
        List<UUID> tenantUserIds) {
}
