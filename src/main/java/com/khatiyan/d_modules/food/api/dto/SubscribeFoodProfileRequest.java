package com.khatiyan.d_modules.food.api.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

public record SubscribeFoodProfileRequest(@NotNull UUID profileId) {
}
