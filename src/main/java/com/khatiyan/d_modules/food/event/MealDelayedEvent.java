package com.khatiyan.d_modules.food.event;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import com.khatiyan.d_modules.property.model.MealType;

/**
 * One of today's meals was pushed later.
 *
 * <p>Carries the tenants on a meal plan at the time of the delay, so the
 * listener tells exactly the people who were expecting that meal, even if a
 * subscription changes before the event is delivered.
 */
public record MealDelayedEvent(
        UUID propertyId,
        String propertyName,
        LocalDate mealDate,
        MealType mealType,
        LocalTime newStartTime,
        LocalTime newEndTime,
        /** Total minutes later than planned. */
        int delayMinutes,
        List<UUID> tenantUserIds) {
}
