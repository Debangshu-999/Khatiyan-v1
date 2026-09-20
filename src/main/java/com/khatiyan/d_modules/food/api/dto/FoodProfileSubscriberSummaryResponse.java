package com.khatiyan.d_modules.food.api.dto;

public record FoodProfileSubscriberSummaryResponse(
        FoodProfileResponse profile,
        long subscriberCount
) {
}
