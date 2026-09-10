package com.khatiyan.d_modules.tenancy.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.khatiyan.d_modules.tenancy.model.ScheduledTenancyExitStatus;

public record ScheduledTenancyExitResponse(
        UUID id,
        UUID exitRequestId,
        UUID tenancyId,
        UUID propertyId,
        UUID tenantUserId,
        LocalDate scheduledCheckoutDate,
        UUID configuredByUserId,
        Instant nextAttemptAt,
        Instant lastAttemptAt,
        int attemptCount,
        String lastFailureCode,
        String lastFailureMessage,
        ScheduledTenancyExitStatus status,
        Instant closedAt,
        String closureReason,
        EndTenancyRequest configuration,
        Instant createdAt,
        Instant updatedAt) {
}
