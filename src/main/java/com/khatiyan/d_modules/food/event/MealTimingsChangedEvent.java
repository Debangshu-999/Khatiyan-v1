package com.khatiyan.d_modules.food.event;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.khatiyan.d_modules.food.service.MealScheduleRules.MealWindow;
import com.khatiyan.d_modules.property.model.MealType;

/**
 * The property's meal timetable changed (P1.5.h.4, 2026-11-08).
 *
 * <p>{@code changed} holds only the meals whose window actually moved, with
 * the new window. Carries every tenant on a food plan now or from tomorrow.
 */
public record MealTimingsChangedEvent(
        UUID propertyId,
        String propertyName,
        Map<MealType, MealWindow> changed,
        List<UUID> tenantUserIds) {
}
