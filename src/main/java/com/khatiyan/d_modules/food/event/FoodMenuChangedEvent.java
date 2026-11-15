package com.khatiyan.d_modules.food.event;

import java.util.List;
import java.util.UUID;

/**
 * A food plan's weekly menu gained, lost or moved a dish (P1.5.h.3, 2026-11-08).
 *
 * <p>Carries the tenants on that plan now or from tomorrow, a hybrid week
 * included when any of its days uses the plan. Quantity edits are the
 * kitchen's numbers and never raise it.
 */
public record FoodMenuChangedEvent(
        UUID propertyId,
        String propertyName,
        UUID profileId,
        String profileName,
        List<UUID> tenantUserIds) {
}
