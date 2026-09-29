package com.khatiyan.d_modules.food.api.dto;

import java.time.DayOfWeek;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A tenant eating a profile. A hybrid tenant appears once under each profile
 * they use (2026-09-29), with {@code days} naming the weekdays they eat it.
 */
public record FoodSubscriberResponse(
        UUID subscriptionId,
        UUID tenancyId,
        UUID tenantUserId,
        String tenantName,
        String tenantPhone,
        String roomNumber,
        UUID profileId,
        String profileName,
        Instant startedAt,
        boolean hybrid,
        List<DayOfWeek> days) {
}
