package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalTime;

import jakarta.validation.constraints.NotNull;

public record UpdateExitScheduleSettingsRequest(
        @NotNull(message = "Execution time is required") LocalTime executionTime) {
}
