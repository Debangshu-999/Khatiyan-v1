package com.khatiyan.d_modules.food.api.dto;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.khatiyan.d_modules.food.model.FoodProfile;
import com.khatiyan.d_modules.food.model.FoodProfileCategory;
import com.khatiyan.d_modules.food.model.FoodSubscription;

/**
 * One version of a tenant's plan (2026-09-29). A normal plan carries its one
 * profile at the top. A hybrid plan leaves those null, and {@code days} names
 * each day's profile, Monday first.
 */
public record FoodPlanVersionResponse(
        UUID id,
        LocalDate effectiveFrom,
        /** The first day it no longer applies. Null while it runs on. */
        LocalDate effectiveUntil,
        boolean hybrid,
        UUID profileId,
        String profileName,
        FoodProfileCategory profileCategory,
        List<PlanDay> days,
        Instant startedAt) {

    public record PlanDay(DayOfWeek day, UUID profileId, String profileName, FoodProfileCategory profileCategory) {
    }

    public static FoodPlanVersionResponse from(FoodSubscription plan, Map<UUID, FoodProfile> profiles) {
        List<PlanDay> days = plan.week().entrySet().stream()
                .map(entry -> {
                    FoodProfile profile = profiles.get(entry.getValue());
                    return new PlanDay(
                            entry.getKey(),
                            entry.getValue(),
                            profile == null ? null : profile.getName(),
                            profile == null ? null : profile.getCategory());
                })
                .toList();
        boolean hybrid = plan.isHybrid();
        PlanDay first = days.isEmpty() ? null : days.get(0);
        return new FoodPlanVersionResponse(
                plan.getId(),
                plan.getEffectiveFrom(),
                plan.getEffectiveUntil(),
                hybrid,
                hybrid || first == null ? null : first.profileId(),
                hybrid || first == null ? null : first.profileName(),
                hybrid || first == null ? null : first.profileCategory(),
                days,
                plan.getStartedAt());
    }
}
