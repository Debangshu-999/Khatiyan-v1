package com.khatiyan.d_modules.food.api.dto;

import java.time.Instant;
import java.util.UUID;

public record FoodSubscriberResponse(
        UUID subscriptionId,
        UUID tenancyId,
        UUID tenantUserId,
        String tenantName,
        String tenantPhone,
        String roomNumber,
        UUID profileId,
        String profileName,
        Instant startedAt) {
}
