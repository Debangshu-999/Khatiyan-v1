package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.LocalTime;
import java.util.UUID;

public record ExitScheduleSettingsResponse(UUID propertyId, LocalTime executionTime) {
}
