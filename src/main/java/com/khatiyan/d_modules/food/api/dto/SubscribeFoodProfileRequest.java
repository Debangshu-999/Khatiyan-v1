package com.khatiyan.d_modules.food.api.dto;

import java.time.DayOfWeek;
import java.util.Map;
import java.util.UUID;

/**
 * A plan to start tomorrow (2026-09-29): one {@code profileId} for every day,
 * or a hybrid week in {@code days}, one profile for each of the seven days.
 * Exactly one of the two.
 */
public record SubscribeFoodProfileRequest(UUID profileId, Map<DayOfWeek, UUID> days) {
}
