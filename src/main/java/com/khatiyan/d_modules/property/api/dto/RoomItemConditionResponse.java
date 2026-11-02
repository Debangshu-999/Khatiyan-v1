package com.khatiyan.d_modules.property.api.dto;

import java.time.Instant;
import java.util.List;

import com.khatiyan.d_modules.property.model.DamageLevel;
import com.khatiyan.d_modules.property.model.RoomItemCondition;

/** One item's running condition in a room: what the next onboarding starts from. */
public record RoomItemConditionResponse(
        String itemName,
        String section,
        DamageLevel level,
        List<String> photoUrls,
        Instant updatedAt) {

    public static RoomItemConditionResponse from(RoomItemCondition condition) {
        return new RoomItemConditionResponse(
                condition.getItemName(),
                condition.getSection(),
                condition.getDamageLevel(),
                List.copyOf(condition.getPhotoUrls()),
                condition.getUpdatedAt());
    }
}
