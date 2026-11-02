package com.khatiyan.d_modules.property.api.dto;

import java.util.List;

import com.khatiyan.d_modules.property.model.DamageLevel;

/** An item's condition as a move-in checklist confirmed it. */
public record RoomConditionWrite(String itemName, String section, DamageLevel level, List<String> photoUrls) {
}
