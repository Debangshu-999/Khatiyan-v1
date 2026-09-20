package com.khatiyan.d_modules.food.api.dto;

import java.util.List;

public record FoodProfileMenuResponse(
        FoodProfileResponse profile,
        List<FoodMenuEntryResponse> entries
) {
}
