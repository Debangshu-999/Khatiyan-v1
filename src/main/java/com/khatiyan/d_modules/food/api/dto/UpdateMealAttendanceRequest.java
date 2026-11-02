package com.khatiyan.d_modules.food.api.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateMealAttendanceRequest(@NotNull Boolean enabled) {
}
